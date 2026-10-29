/**
 * Proposal service (M3-02, FR-501..503). Builds a DRAFT proposal from the catalog version
 * effective today, prices it with the deterministic calculator, stores every line as a snapshot
 * (name, unit, version, catalog value, agreed value, quantity, line total, currency) and, when a
 * human sends it, freezes it.
 *
 * Why history is safe: each line points at an item of a frozen (ACTIVE/RETIRED) catalog version
 * (immutable, M3-01), records the version and copies name/unit/value. Activating a newer catalog
 * version, retiring an old one or editing a draft therefore cannot change a stored proposal;
 * the database proves snapshot == catalog at write time and forbids edits after sending.
 *
 * A proposal value is a FORECAST. Nothing here writes or reads actual revenue (M4-02).
 */

import { z } from "zod";
import type { AuditService } from "../audit/service";
import { type GuardDeps, runAuthorized } from "../auth/guard";
import { type Clock, type Principal, systemClock } from "../auth/types";
import type { RateCardRepository, RateCardVersion } from "../ratecard/types";
import {
  type CatalogItemRef,
  formatQuantity,
  type PricedLine,
  PricingError,
  type PricingMode,
  type PricingResult,
  priceProposal,
} from "./calc";

export const PROPOSAL_ERROR_CODES = [
  "VALIDATION_FAILED",
  "CYCLE_NOT_FOUND",
  "PROPOSAL_NOT_FOUND",
  "CATALOG_NOT_FOUND",
  "NO_ACTIVE_CATALOG",
  "PACKAGE_NOT_FOUND",
  "PACKAGE_INACTIVE",
  "ITEM_NOT_IN_CATALOG",
  "ITEM_INACTIVE",
  "PRICING_INVALID",
  "DUPLICATE_BENEFIT",
  "DOUBLE_COUNTED_BENEFIT",
  "PROPOSAL_FROZEN",
  "NO_LINES",
  "TOTAL_MISMATCH",
  "CONCURRENT_CHANGE",
] as const;
export type ProposalErrorCode = (typeof PROPOSAL_ERROR_CODES)[number];

const HTTP: Record<ProposalErrorCode, number> = {
  VALIDATION_FAILED: 400,
  CYCLE_NOT_FOUND: 404,
  PROPOSAL_NOT_FOUND: 404,
  CATALOG_NOT_FOUND: 404,
  NO_ACTIVE_CATALOG: 409,
  PACKAGE_NOT_FOUND: 404,
  PACKAGE_INACTIVE: 409,
  ITEM_NOT_IN_CATALOG: 422,
  ITEM_INACTIVE: 422,
  PRICING_INVALID: 422,
  DUPLICATE_BENEFIT: 422,
  DOUBLE_COUNTED_BENEFIT: 422,
  PROPOSAL_FROZEN: 409,
  NO_LINES: 422,
  TOTAL_MISMATCH: 409,
  CONCURRENT_CHANGE: 409,
};

export class ProposalError extends Error {
  constructor(readonly code: ProposalErrorCode) {
    super(`proposal: ${code}`);
    this.name = "ProposalError";
  }
}
export type ProposalFailure = { ok: false; code: string; httpStatus: number };
export type ProposalResult<T> = { ok: true; value: T } | ProposalFailure;

export interface ProposalRecord {
  proposalId: string;
  cycleId: string;
  packageId: string | null;
  pricingMode: PricingMode;
  /** Forecast value in whole rupiah. NOT cash received. */
  calculatedValue: number;
  currency: string;
  contentUrl: string | null;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";
  sentAt: Date | null;
}

export interface ProposalLine {
  lineId: string;
  proposalId: string;
  itemId: string;
  source: "PACKAGE" | "CUSTOM";
  /** Decimal string with 3 places, e.g. "2.500". */
  quantity: string;
  agreedUnitValue: number;
  catalogUnitValueSnapshot: number;
  lineTotalValue: number;
  contributionType: ContributionType;
  benefitNameSnapshot: string;
  unitSnapshot: string;
  rateCardVersionSnapshot: number;
}

export const CONTRIBUTION_TYPES = [
  "FINANCIAL",
  "IN_KIND",
  "VOUCHER",
  "SERVICE",
  "CONTENT_EXCHANGE",
  "HYBRID",
] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

export interface ProposalRepository {
  cycleExists(cycleId: string): Promise<boolean>;
  getProposal(proposalId: string): Promise<ProposalRecord | null>;
  listLines(proposalId: string): Promise<ProposalLine[]>;
  insertProposal(p: ProposalRecord): Promise<void>;
  /** Compare-and-set on status. */
  updateProposal(
    proposalId: string,
    expected: ProposalRecord["status"],
    patch: Partial<
      Pick<
        ProposalRecord,
        "packageId" | "pricingMode" | "calculatedValue" | "contentUrl" | "status" | "sentAt"
      >
    >,
  ): Promise<boolean>;
  replaceLines(proposalId: string, lines: ProposalLine[]): Promise<void>;
}

export type CatalogReader = Pick<
  RateCardRepository,
  "listVersions" | "getVersion" | "listItems" | "getPackage" | "listPackageBenefits"
>;

const uuid = z.uuid();
const url = z
  .string()
  .max(2000)
  .refine((u) => {
    try {
      const p = new URL(u);
      return (p.protocol === "https:" || p.protocol === "http:") && !p.username && !p.password;
    } catch {
      return false;
    }
  });
const lineInput = z.strictObject({
  itemId: uuid,
  /** Number or decimal string, at most 3 decimals. */
  quantity: z.union([z.number(), z.string().max(12)]),
  agreedUnitValue: z.number().int().min(0).max(1_000_000_000_000).optional(),
  contributionType: z.enum(CONTRIBUTION_TYPES).default("FINANCIAL"),
});
export const proposalInputSchema = z.strictObject({
  cycleId: uuid,
  catalogName: z.string().trim().min(2).max(100),
  mode: z.enum(["PACKAGE", "CUSTOM", "HYBRID"]),
  packageId: uuid.optional(),
  customLines: z.array(lineInput).max(50).default([]),
  packageAgreedValues: z
    .array(
      z.strictObject({
        itemId: uuid,
        agreedUnitValue: z.number().int().min(0).max(1_000_000_000_000),
      }),
    )
    .max(100)
    .default([]),
});
export const replaceProposalSchema = z.strictObject({
  proposalId: uuid,
  catalogName: z.string().trim().min(2).max(100),
  mode: z.enum(["PACKAGE", "CUSTOM", "HYBRID"]),
  packageId: uuid.optional(),
  customLines: z.array(lineInput).max(50).default([]),
  packageAgreedValues: z
    .array(
      z.strictObject({
        itemId: uuid,
        agreedUnitValue: z.number().int().min(0).max(1_000_000_000_000),
      }),
    )
    .max(100)
    .default([]),
});
export const sendProposalSchema = z.strictObject({ proposalId: uuid, contentUrl: url.optional() });
export const proposalIdSchema = z.strictObject({ proposalId: uuid });

export interface ProposalServiceDeps {
  guard: Pick<GuardDeps, "sessions">;
  audit: AuditService;
  proposals: ProposalRepository;
  catalog: CatalogReader;
  clock?: Clock;
  newId?: () => string;
}

export interface ProposalView {
  proposal: ProposalRecord;
  lines: ProposalLine[];
  /** Sum of package-included line totals, shown for information; already inside the package price. */
  packageBenefitsReferenceValue: number;
}

/** Calendar date in Asia/Jakarta (UTC+7, no DST), as YYYY-MM-DD. */
export function jakartaDate(instant: Date): string {
  return new Date(instant.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function createProposalService(deps: ProposalServiceDeps) {
  const { proposals: repo, catalog, audit } = deps;
  const clock = deps.clock ?? systemClock;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const guardDeps: GuardDeps = {
    sessions: deps.guard.sessions,
    onDecision: (e) => audit.recordDenial(e),
  };

  const fail = (c: ProposalErrorCode): ProposalFailure => ({
    ok: false,
    code: c,
    httpStatus: HTTP[c],
  });
  const unwrap = <T>(
    r: { ok: true; value: unknown } | { ok: false; code: string; httpStatus: number },
  ): ProposalResult<T> => (r.ok ? { ok: true, value: r.value as T } : (r as ProposalFailure));
  async function settle<T>(run: () => Promise<ProposalResult<T>>): Promise<ProposalResult<T>> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ProposalError) return fail(error.code);
      if (error instanceof PricingError) {
        if (error.code === "DUPLICATE_BENEFIT") return fail("DUPLICATE_BENEFIT");
        if (error.code === "DOUBLE_COUNTED_BENEFIT") return fail("DOUBLE_COUNTED_BENEFIT");
        return fail("PRICING_INVALID");
      }
      throw error;
    }
  }
  function parse<T>(schema: z.ZodType<T>, input: unknown): { ok: true; data: T } | ProposalFailure {
    const r = schema.safeParse(input);
    return r.success ? { ok: true, data: r.data } : fail("VALIDATION_FAILED");
  }
  const mutate = <T>(
    token: string | undefined | null,
    body: (
      p: Principal,
    ) => Promise<{ value: T; entityId: string; metadata?: Record<string, unknown> }>,
  ) =>
    settle<T>(async () =>
      unwrap(
        await audit.audited(
          token,
          { action: "proposal.write", kind: "MUTATION", entityType: "proposal" },
          body,
        ),
      ),
    );

  /** The ACTIVE catalog version whose window covers today (Asia/Jakarta). */
  async function effectiveVersion(name: string): Promise<RateCardVersion> {
    const versions = await catalog.listVersions(name);
    if (versions.length === 0) throw new ProposalError("CATALOG_NOT_FOUND");
    const today = jakartaDate(clock.now());
    const hit = versions.find(
      (v) =>
        v.status === "ACTIVE" &&
        v.effectiveFrom <= today &&
        (v.effectiveTo === null || today <= v.effectiveTo),
    );
    if (!hit) throw new ProposalError("NO_ACTIVE_CATALOG");
    return hit;
  }

  interface Built {
    version: RateCardVersion;
    pricing: PricingResult;
    lines: Omit<ProposalLine, "proposalId" | "lineId">[];
    packageId: string | null;
  }

  /** Resolve catalog + package, price, and prepare snapshot lines. Touches nothing. */
  async function build(input: z.infer<typeof proposalInputSchema>): Promise<Built> {
    const version = await effectiveVersion(input.catalogName);
    const items = await catalog.listItems(version.rateCardId);
    const byId = new Map(items.map((i) => [i.itemId, i]));
    const contribution = new Map(input.customLines.map((l) => [l.itemId, l.contributionType]));

    for (const l of input.customLines) {
      const it = byId.get(l.itemId);
      if (!it) throw new ProposalError("ITEM_NOT_IN_CATALOG");
      if (!it.active) throw new ProposalError("ITEM_INACTIVE");
    }

    let pkgInput: Parameters<typeof priceProposal>[0]["package"] = null;
    let packageId: string | null = null;
    if (input.mode !== "CUSTOM") {
      if (!input.packageId) throw new PricingError("PACKAGE_REQUIRED");
      const pkg = await catalog.getPackage(input.packageId);
      if (!pkg || pkg.rateCardId !== version.rateCardId)
        throw new ProposalError("PACKAGE_NOT_FOUND");
      if (!pkg.active) throw new ProposalError("PACKAGE_INACTIVE");
      const benefits = (await catalog.listPackageBenefits(version.rateCardId)).filter(
        (b) => b.packageId === pkg.packageId,
      );
      for (const b of benefits) {
        const it = byId.get(b.itemId);
        if (!it?.active) throw new ProposalError("ITEM_INACTIVE");
      }
      pkgInput = {
        packageId: pkg.packageId,
        listedPrice: pkg.listedPrice,
        benefits: benefits.map((b) => ({
          itemId: b.itemId,
          includedQtyThousandths: b.includedQty * 1000,
        })),
      };
      packageId = pkg.packageId;
    } else if (input.packageId) {
      throw new PricingError("PACKAGE_NOT_ALLOWED");
    }

    const catalogRefs = new Map<string, CatalogItemRef>(
      items.map((i) => [
        i.itemId,
        {
          itemId: i.itemId,
          benefitName: i.benefitName,
          unit: i.unit,
          monetizedUnitValue: i.monetizedUnitValue,
        },
      ]),
    );
    const pricing = priceProposal({
      mode: input.mode,
      package: pkgInput,
      catalog: catalogRefs,
      customLines: input.customLines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        ...(l.agreedUnitValue !== undefined ? { agreedUnitValue: l.agreedUnitValue } : {}),
      })),
      packageAgreedValues: new Map(
        input.packageAgreedValues.map((v) => [v.itemId, v.agreedUnitValue]),
      ),
    });
    if (pricing.lines.length === 0) throw new ProposalError("NO_LINES");

    const lines = pricing.lines.map((l: PricedLine) => ({
      itemId: l.itemId,
      source: l.source,
      quantity: formatQuantity(l.quantityThousandths),
      agreedUnitValue: l.agreedUnitValue,
      catalogUnitValueSnapshot: l.catalogUnitValue,
      lineTotalValue: l.lineTotal,
      contributionType: contribution.get(l.itemId) ?? "FINANCIAL",
      benefitNameSnapshot: l.benefitName,
      unitSnapshot: l.unit,
      rateCardVersionSnapshot: version.version,
    }));
    return { version, pricing, lines, packageId };
  }

  async function createProposal(token: string | undefined | null, input: unknown) {
    const p = parse(proposalInputSchema, input);
    if (!p.ok) return p;
    return mutate<ProposalView>(token, async () => {
      if (!(await repo.cycleExists(p.data.cycleId))) throw new ProposalError("CYCLE_NOT_FOUND");
      const built = await build(p.data);
      const proposal: ProposalRecord = {
        proposalId: newId(),
        cycleId: p.data.cycleId,
        packageId: built.packageId,
        pricingMode: p.data.mode,
        calculatedValue: built.pricing.calculatedValue,
        currency: built.version.currency,
        contentUrl: null,
        status: "DRAFT",
        sentAt: null,
      };
      await repo.insertProposal(proposal);
      const lines = built.lines.map((l) => ({
        ...l,
        lineId: newId(),
        proposalId: proposal.proposalId,
      }));
      await repo.replaceLines(proposal.proposalId, lines);
      return {
        value: {
          proposal,
          lines,
          packageBenefitsReferenceValue: built.pricing.packageBenefitsReferenceValue,
        },
        entityId: proposal.proposalId,
        metadata: {
          mode: proposal.pricingMode,
          lines: lines.length,
          calculatedValue: proposal.calculatedValue,
          catalogVersion: built.version.version,
        },
      };
    });
  }

  async function replaceProposal(token: string | undefined | null, input: unknown) {
    const p = parse(replaceProposalSchema, input);
    if (!p.ok) return p;
    return mutate<ProposalView>(token, async () => {
      const existing = await repo.getProposal(p.data.proposalId);
      if (!existing) throw new ProposalError("PROPOSAL_NOT_FOUND");
      if (existing.status !== "DRAFT") throw new ProposalError("PROPOSAL_FROZEN");
      const built = await build({ ...p.data, cycleId: existing.cycleId });
      const patch = {
        packageId: built.packageId,
        pricingMode: p.data.mode,
        calculatedValue: built.pricing.calculatedValue,
      };
      // Lines first would violate the package/mode check mid-way; update the header, then lines.
      await repo.replaceLines(existing.proposalId, []);
      if (!(await repo.updateProposal(existing.proposalId, "DRAFT", patch)))
        throw new ProposalError("CONCURRENT_CHANGE");
      const lines = built.lines.map((l) => ({
        ...l,
        lineId: newId(),
        proposalId: existing.proposalId,
      }));
      await repo.replaceLines(existing.proposalId, lines);
      return {
        value: {
          proposal: { ...existing, ...patch },
          lines,
          packageBenefitsReferenceValue: built.pricing.packageBenefitsReferenceValue,
        },
        entityId: existing.proposalId,
        metadata: {
          mode: p.data.mode,
          lines: lines.length,
          previousValue: existing.calculatedValue,
          calculatedValue: patch.calculatedValue,
          catalogVersion: built.version.version,
        },
      };
    });
  }

  /** A human marks the proposal as sent. Re-derives the total from the stored lines first. */
  async function sendProposal(token: string | undefined | null, input: unknown) {
    const p = parse(sendProposalSchema, input);
    if (!p.ok) return p;
    return mutate<ProposalView>(token, async () => {
      const existing = await repo.getProposal(p.data.proposalId);
      if (!existing) throw new ProposalError("PROPOSAL_NOT_FOUND");
      if (existing.status !== "DRAFT") throw new ProposalError("PROPOSAL_FROZEN");
      const lines = await repo.listLines(existing.proposalId);
      if (lines.length === 0) throw new ProposalError("NO_LINES");

      let packagePrice = 0;
      if (existing.packageId) {
        const pkg = await catalog.getPackage(existing.packageId);
        if (!pkg) throw new ProposalError("PACKAGE_NOT_FOUND");
        packagePrice = pkg.listedPrice;
      }
      const custom = lines
        .filter((l) => l.source === "CUSTOM")
        .reduce((sum, l) => sum + l.lineTotalValue, 0);
      if (existing.calculatedValue !== packagePrice + custom)
        throw new ProposalError("TOTAL_MISMATCH");

      const now = clock.now();
      const patch = { status: "SENT" as const, sentAt: now, contentUrl: p.data.contentUrl ?? null };
      if (!(await repo.updateProposal(existing.proposalId, "DRAFT", patch)))
        throw new ProposalError("CONCURRENT_CHANGE");
      return {
        value: { proposal: { ...existing, ...patch }, lines, packageBenefitsReferenceValue: 0 },
        entityId: existing.proposalId,
        metadata: {
          calculatedValue: existing.calculatedValue,
          lines: lines.length,
          hasDocumentLink: patch.contentUrl !== null,
        },
      };
    });
  }

  async function getProposal(token: string | undefined | null, input: unknown) {
    const p = parse(proposalIdSchema, input);
    if (!p.ok) return p;
    return settle<ProposalView>(async () =>
      unwrap(
        await runAuthorized(guardDeps, token, "cycle.read", {}, async () => {
          const proposal = await repo.getProposal(p.data.proposalId);
          if (!proposal) throw new ProposalError("PROPOSAL_NOT_FOUND");
          const lines = await repo.listLines(proposal.proposalId);
          const ref = lines
            .filter((l) => l.source === "PACKAGE")
            .reduce((s, l) => s + l.lineTotalValue, 0);
          return { proposal, lines, packageBenefitsReferenceValue: ref };
        }),
      ),
    );
  }

  return { createProposal, replaceProposal, sendProposal, getProposal };
}

export type ProposalService = ReturnType<typeof createProposalService>;
