/** FR-200: authenticated Partner/Contact operations; no UI or SQL imports. */
import { z } from "zod";
import type { AuditService } from "../audit/service";
import { runAuthorized } from "../auth/guard";
import { authorize } from "../auth/policy";
import type { SessionService } from "../auth/session";
import type {
  ContactRecord,
  IndustryCode,
  PartnerRecord,
  SourceTier,
  VerificationStatus,
} from "./models";
import { ESSM_INDUSTRIES } from "./models";

const industry = z.enum(
  ESSM_INDUSTRIES.map((entry) => entry.code) as [IndustryCode, ...IndustryCode[]],
);
const tier = z.enum(["official", "referral", "research", "unverified"]);
const optional = z
  .string()
  .trim()
  .transform((value) => value || null)
  .nullish();
const url = z.url().regex(/^https?:\/\//);
const text = z.string().trim().min(2).max(200);
export const contactInput = z.strictObject({
  name: text,
  title: optional,
  email: z
    .email()
    .transform((v) => v.toLowerCase())
    .nullable()
    .optional(),
  phone: optional,
  sourceUrl: url.nullable().optional(),
  sourceTier: tier,
  lawfulBasisNote: z.string().trim().min(3).max(500),
});
export const partnerInput = z.strictObject({
  name: text,
  industry,
  websiteDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)
    .nullable()
    .optional(),
  officialEmail: z
    .email()
    .transform((v) => v.toLowerCase())
    .nullable()
    .optional(),
  sourceDescription: z.string().trim().min(3).max(500),
  sourceUrl: url.nullable().optional(),
  sourceTier: tier,
  contact: contactInput.optional(),
  confirmDuplicate: z.boolean().optional(),
});
export const partnerPatch = partnerInput.omit({ contact: true }).partial();
export const contactPatch = contactInput.partial().extend({ contactId: z.uuid() });
export type NewPartner = {
  name: string;
  industry: IndustryCode;
  websiteDomain: string | null;
  officialEmail: string | null;
  sourceDescription: string;
  sourceUrl: string | null;
  sourceTier: SourceTier;
};
export type NewContact = {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  sourceUrl: string | null;
  sourceTier: SourceTier;
  lawfulBasisNote: string;
};
export interface PartnerRepository {
  duplicateCandidates(): Promise<{ id: string; name: string; websiteDomain: string | null }[]>;
  search(
    query: string,
    industry: IndustryCode | null,
    includeContactEmail?: boolean,
  ): Promise<PartnerRecord[]>;
  getById(id: string): Promise<PartnerRecord | null>;
  insertPartner(data: NewPartner): Promise<PartnerRecord>;
  updatePartner(id: string, data: Partial<NewPartner>): Promise<PartnerRecord | null>;
  insertContact(partnerId: string, data: NewContact): Promise<ContactRecord>;
  updateContact(
    partnerId: string,
    contactId: string,
    data: Partial<NewContact>,
  ): Promise<ContactRecord | null>;
  setVerification(
    partnerId: string,
    contactId: string,
    status: VerificationStatus,
    actorId: string,
    evidence?: {
      sourceUrl?: string | null;
      sourceTier?: SourceTier;
      lawfulBasisNote?: string;
    },
  ): Promise<ContactRecord | null>;
  setDnc(
    partnerId: string,
    contactId: string,
    enabled: boolean,
    reason: string,
    actorId: string,
  ): Promise<ContactRecord | null>;
}
type Failure = {
  ok: false;
  code: string;
  httpStatus: number;
  issues?: { path: string; message: string }[];
  duplicates?: { partnerId: string; name: string; reason: string }[];
};
class PartnerError extends Error {
  constructor(readonly failure: Failure) {
    super(failure.code);
  }
}
const fail = (code: string, httpStatus: number, extras: Partial<Failure> = {}): Failure => ({
  ok: false,
  code,
  httpStatus,
  ...extras,
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new PartnerError(
      fail("validation_failed", 422, {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }),
    );
  return result.data;
}
function redactContacts(record: PartnerRecord, allowed: boolean): PartnerRecord {
  return allowed ? record : { ...record, contacts: [] };
}
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function nameTokens(value: string): Set<string> {
  return new Set(normalizeName(value).split(" ").filter(Boolean));
}
/** Safe, advisory duplicate review; a human still confirms before saving. */
export function findPartnerDuplicates(
  candidates: { id: string; name: string; websiteDomain: string | null }[],
  name: string,
  domain: string | null,
) {
  const target = normalizeName(name);
  const targetTokens = nameTokens(name);
  return candidates.flatMap((item) => {
    if (domain && item.websiteDomain?.toLowerCase() === domain)
      return [{ partnerId: item.id, name: item.name, reason: "same_domain" }];
    const itemName = normalizeName(item.name);
    if (target && itemName === target)
      return [{ partnerId: item.id, name: item.name, reason: "same_name" }];
    const overlap = [...nameTokens(item.name)].filter((token) => targetTokens.has(token)).length;
    const singleTokenName = targetTokens.size === 1 || nameTokens(item.name).size === 1;
    return overlap >= 2 || (overlap === 1 && singleTokenName)
      ? [{ partnerId: item.id, name: item.name, reason: "similar_name" }]
      : [];
  });
}
export function createPartnerService(deps: {
  sessions: Pick<SessionService, "authenticate">;
  audit: AuditService;
  repository: PartnerRepository;
}) {
  const repo = deps.repository;
  async function settle<T>(work: () => Promise<T>): Promise<T | Failure> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof PartnerError) return error.failure;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505" &&
        "constraint" in error &&
        error.constraint === "contacts_partner_email_key"
      ) {
        return fail("duplicate_contact", 409);
      }
      throw error;
    }
  }
  return {
    async search(token: string | null | undefined, input: unknown) {
      return settle(async () =>
        runAuthorized(
          { sessions: deps.sessions, onDecision: deps.audit.recordDenial },
          token,
          "partner.read",
          {},
          async (principal) => {
            const data = parse(
              z.strictObject({
                q: z.string().max(200).default(""),
                industry: industry.nullable().default(null),
              }),
              input,
            );
            const contactsAllowed = authorize(principal, "contact.read").ok;
            const items = await repo.search(data.q, data.industry, contactsAllowed);
            return items.map((p) => redactContacts(p, contactsAllowed));
          },
        ),
      );
    },
    async getById(token: string | null | undefined, id: unknown) {
      return settle(async () =>
        runAuthorized(
          { sessions: deps.sessions, onDecision: deps.audit.recordDenial },
          token,
          "partner.read",
          {},
          async (principal) => {
            const partner = await repo.getById(parse(z.uuid(), id));
            if (!partner) throw new PartnerError(fail("not_found", 404));
            return redactContacts(partner, authorize(principal, "contact.read").ok);
          },
        ),
      );
    },
    async create(token: string | null | undefined, input: unknown) {
      return settle(async () =>
        deps.audit.audited(
          token,
          { action: "partner.write", kind: "MUTATION", entityType: "partner" },
          async () => {
            const data = parse(partnerInput, input);
            const warnings = findPartnerDuplicates(
              await repo.duplicateCandidates(),
              data.name,
              data.websiteDomain ?? null,
            );
            if (warnings.length && !data.confirmDuplicate)
              throw new PartnerError(
                fail("duplicate_confirmation_required", 409, { duplicates: warnings }),
              );
            const saved = await repo.insertPartner({
              name: data.name,
              industry: data.industry,
              websiteDomain: data.websiteDomain ?? null,
              officialEmail: data.officialEmail ?? null,
              sourceDescription: data.sourceDescription,
              sourceUrl: data.sourceUrl ?? null,
              sourceTier: data.sourceTier,
            });
            if (data.contact)
              await repo.insertContact(saved.id, {
                name: data.contact.name,
                title: data.contact.title ?? null,
                email: data.contact.email ?? null,
                phone: data.contact.phone ?? null,
                sourceUrl: data.contact.sourceUrl ?? null,
                sourceTier: data.contact.sourceTier,
                lawfulBasisNote: data.contact.lawfulBasisNote,
              });
            const complete = await repo.getById(saved.id);
            if (!complete) throw new Error("partner_insert_failed");
            return {
              value: complete,
              entityId: saved.id,
              metadata: { changedFields: ["partner", ...(data.contact ? ["contact"] : [])] },
            };
          },
        ),
      );
    },
    async update(token: string | null | undefined, id: unknown, input: unknown) {
      return settle(async () =>
        deps.audit.audited(
          token,
          { action: "partner.write", kind: "MUTATION", entityType: "partner" },
          async () => {
            const partnerId = parse(z.uuid(), id);
            const { confirmDuplicate, ...data } = parse(partnerPatch, input);
            if (!Object.keys(data).length) throw new PartnerError(fail("validation_failed", 422));
            const existing = await repo.getById(partnerId);
            if (!existing) throw new PartnerError(fail("not_found", 404));
            if (data.name || data.websiteDomain) {
              const nextDomain =
                data.websiteDomain === undefined ? existing.websiteDomain : data.websiteDomain;
              const warnings = findPartnerDuplicates(
                (await repo.duplicateCandidates()).filter((item) => item.id !== partnerId),
                data.name ?? existing.name,
                nextDomain,
              );
              if (warnings.length && !confirmDuplicate)
                throw new PartnerError(
                  fail("duplicate_confirmation_required", 409, { duplicates: warnings }),
                );
            }
            const updated = await repo.updatePartner(partnerId, data);
            if (!updated) throw new PartnerError(fail("not_found", 404));
            return {
              value: updated,
              entityId: partnerId,
              metadata: { changedFields: Object.keys(data) },
            };
          },
        ),
      );
    },
    async createContact(token: string | null | undefined, id: unknown, input: unknown) {
      return settle(async () =>
        deps.audit.audited(
          token,
          { action: "contact.write", kind: "MUTATION", entityType: "contact" },
          async () => {
            const partnerId = parse(z.uuid(), id);
            const data = parse(contactInput, input);
            if (!data.email && !data.phone)
              throw new PartnerError(
                fail("validation_failed", 422, {
                  issues: [{ path: "email", message: "Email or phone is required" }],
                }),
              );
            if (!(await repo.getById(partnerId))) throw new PartnerError(fail("not_found", 404));
            const created = await repo.insertContact(partnerId, {
              name: data.name,
              email: data.email ?? null,
              title: data.title ?? null,
              phone: data.phone ?? null,
              sourceUrl: data.sourceUrl ?? null,
              sourceTier: data.sourceTier,
              lawfulBasisNote: data.lawfulBasisNote,
            });
            return {
              value: created,
              entityId: created.id,
              metadata: {
                changedFields: ["name", "email", "phone", "sourceTier", "lawfulBasisNote"],
              },
            };
          },
        ),
      );
    },
    async updateContact(token: string | null | undefined, id: unknown, input: unknown) {
      return settle(async () =>
        deps.audit.audited(
          token,
          { action: "contact.write", kind: "MUTATION", entityType: "contact" },
          async () => {
            const partnerId = parse(z.uuid(), id);
            const { contactId, ...data } = parse(contactPatch, input);
            if (!Object.keys(data).length) throw new PartnerError(fail("validation_failed", 422));
            const current = (await repo.getById(partnerId))?.contacts.find(
              (item) => item.id === contactId,
            );
            if (!current) throw new PartnerError(fail("not_found", 404));
            const nextEmail = data.email === undefined ? current.email : data.email;
            const nextPhone = data.phone === undefined ? current.phone : data.phone;
            if (!nextEmail && !nextPhone)
              throw new PartnerError(
                fail("validation_failed", 422, {
                  issues: [{ path: "email", message: "Email or phone is required" }],
                }),
              );
            const saved = await repo.updateContact(partnerId, contactId, data);
            if (!saved) throw new PartnerError(fail("not_found", 404));
            return {
              value: saved,
              entityId: contactId,
              metadata: { changedFields: Object.keys(data) },
            };
          },
        ),
      );
    },
    async setVerification(token: string | null | undefined, id: unknown, input: unknown) {
      return settle(async () =>
        deps.audit.audited(
          token,
          { action: "contact.write", kind: "MUTATION", entityType: "contact" },
          async (actor) => {
            const partnerId = parse(z.uuid(), id);
            const data = parse(
              z.strictObject({
                contactId: z.uuid(),
                verification: z.enum(["unverified", "pending", "verified", "failed"]),
                sourceUrl: url.optional(),
                sourceTier: tier.optional(),
                lawfulBasisNote: z.string().trim().min(3).max(500).optional(),
              }),
              input,
            );
            const existing = (await repo.getById(partnerId))?.contacts.find(
              (item) => item.id === data.contactId,
            );
            if (!existing) throw new PartnerError(fail("not_found", 404));
            if (data.verification === "verified" && !(data.sourceUrl ?? existing.sourceUrl)) {
              throw new PartnerError(
                fail("validation_failed", 422, {
                  issues: [
                    { path: "sourceUrl", message: "Source URL is required for verification" },
                  ],
                }),
              );
            }
            if (data.verification === "verified" && !existing.email && !existing.phone) {
              throw new PartnerError(
                fail("validation_failed", 422, {
                  issues: [
                    {
                      path: "contactId",
                      message: "Email or phone is required for verification",
                    },
                  ],
                }),
              );
            }
            const saved = await repo.setVerification(
              partnerId,
              data.contactId,
              data.verification,
              actor.userId,
              {
                sourceUrl: data.sourceUrl ?? null,
                ...(data.sourceTier ? { sourceTier: data.sourceTier } : {}),
                ...(data.lawfulBasisNote ? { lawfulBasisNote: data.lawfulBasisNote } : {}),
              },
            );
            if (!saved) throw new PartnerError(fail("not_found", 404));
            return {
              value: saved,
              entityId: saved.id,
              metadata: {
                changedFields: [
                  "verificationStatus",
                  ...(data.sourceUrl ? ["sourceUrl"] : []),
                  ...(data.sourceTier ? ["sourceTier"] : []),
                  ...(data.lawfulBasisNote ? ["lawfulBasisNote"] : []),
                ],
              },
            };
          },
        ),
      );
    },
    async setDnc(token: string | null | undefined, id: unknown, input: unknown) {
      return settle(async () =>
        deps.audit.audited(
          token,
          { action: "contact.write", kind: "MUTATION", entityType: "contact" },
          async (actor) => {
            const partnerId = parse(z.uuid(), id);
            const data = parse(
              z.strictObject({
                contactId: z.uuid(),
                doNotContact: z.boolean(),
                reason: z.string().trim().min(3).max(500),
              }),
              input,
            );
            const current = (await repo.getById(partnerId))?.contacts.find(
              (item) => item.id === data.contactId,
            );
            if (!current) throw new PartnerError(fail("not_found", 404));
            const saved = await repo.setDnc(
              partnerId,
              data.contactId,
              data.doNotContact,
              data.reason,
              actor.userId,
            );
            if (!saved) throw new PartnerError(fail("not_found", 404));
            return {
              value: saved,
              entityId: saved.id,
              metadata: { changedFields: ["doNotContact"], doNotContact: data.doNotContact },
            };
          },
        ),
      );
    },
  };
}
