/**
 * Rate Card service (M3-01, FR-500). CRM Lead-only edits, immutable history.
 *
 * Lifecycle: a version is created as a DRAFT (copying the latest version if asked), edited
 * freely by CRM Leads, then ACTIVATED. Activation freezes it and retires the previous ACTIVE
 * version of the same catalog name in the same transaction, ending its effective window the
 * day before. ACTIVE and RETIRED versions are never edited again (also enforced by database
 * triggers); a price change is a new version. Existing proposals hold their own snapshot
 * (M1-01 `proposal_benefits`), so activating a new version cannot rewrite them.
 *
 * Authorization: `ratecard.edit` and `package.edit` are CRM Lead only (PRD §11); reading is
 * open to anyone who may read the catalog. Every call is Zod-validated, authorized through
 * the M0-05 guard and audited through M0-06.
 *
 * Values start PROPOSED. A CRM Lead confirms them explicitly; activating a version that still
 * contains PROPOSED values requires acknowledging that. No ESSM scoring formula is applied
 * anywhere (DECISIONS Q-01).
 */

import { z } from "zod";
import type { AuditService } from "../audit/service";
import { type GuardDeps, runAuthorized } from "../auth/guard";
import { type Clock, type Principal, systemClock } from "../auth/types";
import type {
  CatalogVersionView,
  PackageBenefit,
  RateCardItem,
  RateCardPackage,
  RateCardRepository,
  RateCardVersion,
} from "./types";

export const RATE_CARD_ERROR_CODES = [
  "VALIDATION_FAILED",
  "VERSION_NOT_FOUND",
  "ITEM_NOT_FOUND",
  "PACKAGE_NOT_FOUND",
  "CATALOG_NOT_FOUND",
  "CATEGORY_UNKNOWN",
  "DRAFT_EXISTS",
  "NOT_A_DRAFT",
  "NOT_ACTIVE",
  "DUPLICATE_NAME",
  "NO_ITEMS",
  "UNCONFIRMED_VALUES",
  "EFFECTIVE_DATE_CONFLICT",
  "ITEM_IN_USE",
  "NO_CHANGE",
  "CONCURRENT_CHANGE",
  "CROSS_VERSION_REFERENCE",
] as const;
export type RateCardErrorCode = (typeof RATE_CARD_ERROR_CODES)[number];

const HTTP: Record<RateCardErrorCode, number> = {
  VALIDATION_FAILED: 400,
  VERSION_NOT_FOUND: 404,
  ITEM_NOT_FOUND: 404,
  PACKAGE_NOT_FOUND: 404,
  CATALOG_NOT_FOUND: 404,
  CATEGORY_UNKNOWN: 422,
  DRAFT_EXISTS: 409,
  NOT_A_DRAFT: 409,
  NOT_ACTIVE: 409,
  DUPLICATE_NAME: 409,
  NO_ITEMS: 422,
  UNCONFIRMED_VALUES: 422,
  EFFECTIVE_DATE_CONFLICT: 409,
  ITEM_IN_USE: 409,
  NO_CHANGE: 409,
  CONCURRENT_CHANGE: 409,
  CROSS_VERSION_REFERENCE: 422,
};

export class RateCardError extends Error {
  constructor(readonly code: RateCardErrorCode) {
    super(`ratecard: ${code}`);
    this.name = "RateCardError";
  }
}
export type RateCardFailure = { ok: false; code: string; httpStatus: number };
export type RateCardResult<T> = { ok: true; value: T } | RateCardFailure;

const uuid = z.uuid();
const date = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  .refine(
    (d) =>
      !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) &&
      new Date(`${d}T00:00:00Z`).toISOString().startsWith(d),
  );
/** Whole rupiah, bounded well below Number.MAX_SAFE_INTEGER so sums stay exact. */
const rupiah = z.number().int().min(0).max(1_000_000_000_000);
const name = z.string().trim().min(2).max(100);
const code = z.string().regex(/^[A-Z][A-Z0-9_]*$/);

export const rateCardCreateDraftSchema = z.strictObject({
  name,
  effectiveFrom: date,
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("IDR"),
  /** Copy items and packages of this existing version into the draft (values reset to PROPOSED). */
  copyFromRateCardId: uuid.optional(),
});
export const rateCardItemSchema = z.strictObject({
  rateCardId: uuid,
  category: code,
  benefitName: name,
  monetizedUnitValue: rupiah,
  unit: z.string().trim().min(1).max(40),
});
export const rateCardUpdateItemSchema = z
  .strictObject({
    itemId: uuid,
    benefitName: name.optional(),
    monetizedUnitValue: rupiah.optional(),
    unit: z.string().trim().min(1).max(40).optional(),
    category: code.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 1);
export const rateCardItemIdSchema = z.strictObject({ itemId: uuid });
export const rateCardPackageSchema = z.strictObject({
  rateCardId: uuid,
  packageName: name,
  listedPrice: rupiah,
  slotLimits: z.string().trim().max(300).default(""),
});
export const rateCardUpdatePackageSchema = z
  .strictObject({
    packageId: uuid,
    packageName: name.optional(),
    listedPrice: rupiah.optional(),
    slotLimits: z.string().trim().max(300).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 1);
export const rateCardPackageBenefitsSchema = z.strictObject({
  packageId: uuid,
  benefits: z
    .array(
      z.strictObject({
        itemId: uuid,
        includedQty: z.number().int().min(1).max(10_000),
        slotLimit: z.number().int().min(1).max(10_000).nullable().default(null),
      }),
    )
    .max(100),
});
export const rateCardIdSchema = z.strictObject({ rateCardId: uuid });
export const rateCardActivateSchema = z.strictObject({
  rateCardId: uuid,
  /** Must be true to activate a version that still has PROPOSED (unconfirmed) values. */
  acknowledgeUnconfirmed: z.boolean().default(false),
});
export const rateCardEffectiveSchema = z.strictObject({ name, onDate: date });

export interface RateCardServiceDeps {
  guard: Pick<GuardDeps, "sessions">;
  audit: AuditService;
  repository: RateCardRepository;
  clock?: Clock;
  newId?: () => string;
}

function addDays(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

export function createRateCardService(deps: RateCardServiceDeps) {
  const { repository: repo, audit } = deps;
  const clock = deps.clock ?? systemClock;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const guardDeps: GuardDeps = {
    sessions: deps.guard.sessions,
    onDecision: (e) => audit.recordDenial(e),
  };

  const fail = (c: RateCardErrorCode): RateCardFailure => ({
    ok: false,
    code: c,
    httpStatus: HTTP[c],
  });
  const unwrap = <T>(
    r: { ok: true; value: unknown } | { ok: false; code: string; httpStatus: number },
  ): RateCardResult<T> => (r.ok ? { ok: true, value: r.value as T } : (r as RateCardFailure));
  async function settle<T>(run: () => Promise<RateCardResult<T>>): Promise<RateCardResult<T>> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof RateCardError) return fail(error.code);
      throw error;
    }
  }
  function parse<T>(schema: z.ZodType<T>, input: unknown): { ok: true; data: T } | RateCardFailure {
    const r = schema.safeParse(input);
    return r.success ? { ok: true, data: r.data } : fail("VALIDATION_FAILED");
  }
  const edit = <T>(
    token: string | undefined | null,
    action: "ratecard.edit" | "package.edit",
    entityType: string,
    body: (
      p: Principal,
    ) => Promise<{ value: T; entityId: string; metadata?: Record<string, unknown> }>,
  ) =>
    settle<T>(async () =>
      unwrap(await audit.audited(token, { action, kind: "MUTATION", entityType }, body)),
    );

  async function draftVersion(rateCardId: string): Promise<RateCardVersion> {
    const v = await repo.getVersion(rateCardId);
    if (!v) throw new RateCardError("VERSION_NOT_FOUND");
    if (v.status !== "DRAFT") throw new RateCardError("NOT_A_DRAFT");
    return v;
  }

  // ---------------------------------------------------------------------------------------------
  // Versions
  // ---------------------------------------------------------------------------------------------

  async function createDraft(token: string | undefined | null, input: unknown) {
    const p = parse(rateCardCreateDraftSchema, input);
    if (!p.ok) return p;
    return edit<RateCardVersion>(token, "ratecard.edit", "rate_card", async (principal) => {
      const latest = await repo.latestVersion(p.data.name);
      if (latest?.status === "DRAFT") throw new RateCardError("DRAFT_EXISTS");
      const source = p.data.copyFromRateCardId
        ? await repo.getVersion(p.data.copyFromRateCardId)
        : null;
      if (p.data.copyFromRateCardId && (!source || source.name !== p.data.name)) {
        throw new RateCardError("VERSION_NOT_FOUND");
      }
      const version: RateCardVersion = {
        rateCardId: newId(),
        name: p.data.name,
        version: (latest?.version ?? 0) + 1,
        currency: source?.currency ?? p.data.currency,
        status: "DRAFT",
        effectiveFrom: p.data.effectiveFrom,
        effectiveTo: null,
        ownerId: principal.userId,
      };
      await repo.insertVersion(version);

      let copiedItems = 0;
      if (source) {
        const idMap = new Map<string, string>();
        for (const item of await repo.listItems(source.rateCardId)) {
          const copy: RateCardItem = {
            ...item,
            itemId: newId(),
            rateCardId: version.rateCardId,
            valueStatus: "PROPOSED",
            confirmedBy: null,
            confirmedAt: null,
          };
          idMap.set(item.itemId, copy.itemId);
          await repo.insertItem(copy);
          copiedItems++;
        }
        const benefits = await repo.listPackageBenefits(source.rateCardId);
        for (const pkg of await repo.listPackages(source.rateCardId)) {
          const copy: RateCardPackage = {
            ...pkg,
            packageId: newId(),
            rateCardId: version.rateCardId,
          };
          await repo.insertPackage(copy);
          await repo.replacePackageBenefits(
            copy.packageId,
            version.rateCardId,
            benefits
              .filter((b) => b.packageId === pkg.packageId && idMap.has(b.itemId))
              .map((b) => ({
                ...b,
                packageBenefitId: newId(),
                packageId: copy.packageId,
                rateCardId: version.rateCardId,
                itemId: idMap.get(b.itemId) as string,
              })),
          );
        }
      }
      return {
        value: version,
        entityId: version.rateCardId,
        metadata: {
          version: version.version,
          copiedItems,
          copiedFromVersion: source?.version ?? null,
        },
      };
    });
  }

  async function discardDraft(token: string | undefined | null, input: unknown) {
    const p = parse(rateCardIdSchema, input);
    if (!p.ok) return p;
    return edit<{ rateCardId: string }>(token, "ratecard.edit", "rate_card", async () => {
      const v = await draftVersion(p.data.rateCardId);
      if (!(await repo.deleteDraft(v.rateCardId))) throw new RateCardError("CONCURRENT_CHANGE");
      return {
        value: { rateCardId: v.rateCardId },
        entityId: v.rateCardId,
        metadata: { version: v.version, discarded: true },
      };
    });
  }

  async function activate(token: string | undefined | null, input: unknown) {
    const p = parse(rateCardActivateSchema, input);
    if (!p.ok) return p;
    return edit<{
      activated: RateCardVersion;
      retired: RateCardVersion | null;
      unconfirmedItems: number;
    }>(token, "ratecard.edit", "rate_card", async () => {
      const draft = await draftVersion(p.data.rateCardId);
      const items = await repo.listItems(draft.rateCardId);
      if (items.length === 0) throw new RateCardError("NO_ITEMS");
      const unconfirmed = items.filter((i) => i.active && i.valueStatus !== "CONFIRMED").length;
      if (unconfirmed > 0 && !p.data.acknowledgeUnconfirmed)
        throw new RateCardError("UNCONFIRMED_VALUES");

      const versions = await repo.listVersions(draft.name);
      const current = versions.find((v) => v.status === "ACTIVE") ?? null;
      // The new version must start after the one it replaces, and after every retired window.
      if (current && draft.effectiveFrom <= current.effectiveFrom)
        throw new RateCardError("EFFECTIVE_DATE_CONFLICT");
      for (const v of versions) {
        if (
          v.status === "RETIRED" &&
          v.effectiveTo !== null &&
          draft.effectiveFrom <= v.effectiveTo
        ) {
          throw new RateCardError("EFFECTIVE_DATE_CONFLICT");
        }
      }

      let retired: RateCardVersion | null = null;
      if (current) {
        const endsOn = addDays(draft.effectiveFrom, -1);
        if (
          !(await repo.updateVersion(current.rateCardId, "ACTIVE", {
            status: "RETIRED",
            effectiveTo: endsOn,
          }))
        ) {
          throw new RateCardError("CONCURRENT_CHANGE");
        }
        retired = { ...current, status: "RETIRED", effectiveTo: endsOn };
      }
      if (!(await repo.updateVersion(draft.rateCardId, "DRAFT", { status: "ACTIVE" }))) {
        throw new RateCardError("CONCURRENT_CHANGE");
      }
      return {
        value: {
          activated: { ...draft, status: "ACTIVE" as const },
          retired,
          unconfirmedItems: unconfirmed,
        },
        entityId: draft.rateCardId,
        metadata: {
          version: draft.version,
          retiredVersion: retired?.version ?? null,
          unconfirmedItems: unconfirmed,
          items: items.length,
        },
      };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Items (DRAFT only)
  // ---------------------------------------------------------------------------------------------

  async function addItem(token: string | undefined | null, input: unknown) {
    const p = parse(rateCardItemSchema, input);
    if (!p.ok) return p;
    return edit<RateCardItem>(token, "ratecard.edit", "rate_card_item", async () => {
      const v = await draftVersion(p.data.rateCardId);
      if (!(await repo.categoryExists(p.data.category)))
        throw new RateCardError("CATEGORY_UNKNOWN");
      const existing = await repo.listItems(v.rateCardId);
      if (
        existing.some(
          (i) =>
            i.category === p.data.category &&
            i.benefitName.toLowerCase() === p.data.benefitName.toLowerCase(),
        )
      ) {
        throw new RateCardError("DUPLICATE_NAME");
      }
      const item: RateCardItem = {
        itemId: newId(),
        rateCardId: v.rateCardId,
        category: p.data.category,
        benefitName: p.data.benefitName,
        monetizedUnitValue: p.data.monetizedUnitValue,
        unit: p.data.unit,
        active: true,
        valueStatus: "PROPOSED",
        confirmedBy: null,
        confirmedAt: null,
      };
      await repo.insertItem(item);
      return {
        value: item,
        entityId: item.itemId,
        metadata: {
          rateCardId: v.rateCardId,
          category: item.category,
          value: item.monetizedUnitValue,
        },
      };
    });
  }

  async function updateItem(token: string | undefined | null, input: unknown) {
    const p = parse(rateCardUpdateItemSchema, input);
    if (!p.ok) return p;
    const { itemId, ...changes } = p.data;
    return edit<RateCardItem>(token, "ratecard.edit", "rate_card_item", async () => {
      const item = await repo.getItem(itemId);
      if (!item) throw new RateCardError("ITEM_NOT_FOUND");
      await draftVersion(item.rateCardId);
      if (changes.category && !(await repo.categoryExists(changes.category)))
        throw new RateCardError("CATEGORY_UNKNOWN");
      const next = {
        ...item,
        ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)),
      } as RateCardItem;
      const changed = (Object.keys(changes) as (keyof typeof changes)[]).filter(
        (k) => changes[k] !== undefined && changes[k] !== item[k],
      );
      if (changed.length === 0) throw new RateCardError("NO_CHANGE");
      // Any edit to the value, unit or identity of a benefit voids an earlier confirmation.
      const reset = changed.some((k) => k !== "active") && item.valueStatus === "CONFIRMED";
      if (reset)
        Object.assign(next, { valueStatus: "PROPOSED", confirmedBy: null, confirmedAt: null });
      await repo.updateItem(itemId, {
        ...changes,
        ...(reset
          ? { valueStatus: "PROPOSED" as const, confirmedBy: null, confirmedAt: null }
          : {}),
      });
      return {
        value: next,
        entityId: itemId,
        metadata: {
          changedFields: changed,
          previousValue: item.monetizedUnitValue,
          newValue: next.monetizedUnitValue,
          confirmationReset: reset,
        },
      };
    });
  }

  async function removeItem(token: string | undefined | null, input: unknown) {
    const p = parse(rateCardItemIdSchema, input);
    if (!p.ok) return p;
    return edit<{ itemId: string }>(token, "ratecard.edit", "rate_card_item", async () => {
      const item = await repo.getItem(p.data.itemId);
      if (!item) throw new RateCardError("ITEM_NOT_FOUND");
      await draftVersion(item.rateCardId);
      if (await repo.itemIsReferenced(item.itemId)) throw new RateCardError("ITEM_IN_USE");
      if (!(await repo.deleteItem(item.itemId))) throw new RateCardError("CONCURRENT_CHANGE");
      return { value: { itemId: item.itemId }, entityId: item.itemId, metadata: { removed: true } };
    });
  }

  /** A CRM Lead states that this value has been checked against the approved source. */
  async function confirmItemValue(token: string | undefined | null, input: unknown) {
    const p = parse(rateCardItemIdSchema, input);
    if (!p.ok) return p;
    return edit<RateCardItem>(token, "ratecard.edit", "rate_card_item", async (principal) => {
      const item = await repo.getItem(p.data.itemId);
      if (!item) throw new RateCardError("ITEM_NOT_FOUND");
      await draftVersion(item.rateCardId);
      if (item.valueStatus === "CONFIRMED") throw new RateCardError("NO_CHANGE");
      const patch = {
        valueStatus: "CONFIRMED" as const,
        confirmedBy: principal.userId,
        confirmedAt: clock.now(),
      };
      await repo.updateItem(item.itemId, patch);
      return {
        value: { ...item, ...patch },
        entityId: item.itemId,
        metadata: { value: item.monetizedUnitValue },
      };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Packages (DRAFT only; `package.edit`)
  // ---------------------------------------------------------------------------------------------

  async function addPackage(token: string | undefined | null, input: unknown) {
    const p = parse(rateCardPackageSchema, input);
    if (!p.ok) return p;
    return edit<RateCardPackage>(token, "package.edit", "rate_card_package", async () => {
      const v = await draftVersion(p.data.rateCardId);
      if (
        (await repo.listPackages(v.rateCardId)).some(
          (x) => x.packageName.toLowerCase() === p.data.packageName.toLowerCase(),
        )
      ) {
        throw new RateCardError("DUPLICATE_NAME");
      }
      const pkg: RateCardPackage = {
        packageId: newId(),
        rateCardId: v.rateCardId,
        packageName: p.data.packageName,
        listedPrice: p.data.listedPrice,
        slotLimits: p.data.slotLimits,
        active: true,
      };
      await repo.insertPackage(pkg);
      return { value: pkg, entityId: pkg.packageId, metadata: { listedPrice: pkg.listedPrice } };
    });
  }

  async function updatePackage(token: string | undefined | null, input: unknown) {
    const p = parse(rateCardUpdatePackageSchema, input);
    if (!p.ok) return p;
    const { packageId, ...changes } = p.data;
    return edit<RateCardPackage>(token, "package.edit", "rate_card_package", async () => {
      const pkg = await repo.getPackage(packageId);
      if (!pkg) throw new RateCardError("PACKAGE_NOT_FOUND");
      await draftVersion(pkg.rateCardId);
      const changed = (Object.keys(changes) as (keyof typeof changes)[]).filter(
        (k) => changes[k] !== undefined && changes[k] !== pkg[k],
      );
      if (changed.length === 0) throw new RateCardError("NO_CHANGE");
      await repo.updatePackage(packageId, changes);
      return {
        value: {
          ...pkg,
          ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)),
        } as RateCardPackage,
        entityId: packageId,
        metadata: {
          changedFields: changed,
          previousPrice: pkg.listedPrice,
          newPrice: changes.listedPrice ?? pkg.listedPrice,
        },
      };
    });
  }

  async function setPackageBenefits(token: string | undefined | null, input: unknown) {
    const p = parse(rateCardPackageBenefitsSchema, input);
    if (!p.ok) return p;
    return edit<PackageBenefit[]>(token, "package.edit", "rate_card_package", async () => {
      const pkg = await repo.getPackage(p.data.packageId);
      if (!pkg) throw new RateCardError("PACKAGE_NOT_FOUND");
      await draftVersion(pkg.rateCardId);
      const seen = new Set<string>();
      const rows: PackageBenefit[] = [];
      for (const b of p.data.benefits) {
        if (seen.has(b.itemId)) throw new RateCardError("DUPLICATE_NAME"); // a benefit counts once per package
        seen.add(b.itemId);
        const item = await repo.getItem(b.itemId);
        if (!item) throw new RateCardError("ITEM_NOT_FOUND");
        if (item.rateCardId !== pkg.rateCardId) throw new RateCardError("CROSS_VERSION_REFERENCE");
        rows.push({
          packageBenefitId: newId(),
          packageId: pkg.packageId,
          itemId: item.itemId,
          rateCardId: pkg.rateCardId,
          includedQty: b.includedQty,
          slotLimit: b.slotLimit,
        });
      }
      await repo.replacePackageBenefits(pkg.packageId, pkg.rateCardId, rows);
      return { value: rows, entityId: pkg.packageId, metadata: { benefits: rows.length } };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------------------------

  async function view(rateCardId: string): Promise<CatalogVersionView> {
    const version = await repo.getVersion(rateCardId);
    if (!version) throw new RateCardError("VERSION_NOT_FOUND");
    return {
      version,
      items: await repo.listItems(rateCardId),
      packages: await repo.listPackages(rateCardId),
      packageBenefits: await repo.listPackageBenefits(rateCardId),
    };
  }

  async function getVersion(token: string | undefined | null, input: unknown) {
    const p = parse(rateCardIdSchema, input);
    if (!p.ok) return p;
    return settle<CatalogVersionView>(async () =>
      unwrap(
        await runAuthorized(guardDeps, token, "ratecard.read", {}, () => view(p.data.rateCardId)),
      ),
    );
  }

  async function listVersions(token: string | undefined | null, input: unknown) {
    const p = parse(z.strictObject({ name }), input);
    if (!p.ok) return p;
    return settle<RateCardVersion[]>(async () =>
      unwrap(
        await runAuthorized(guardDeps, token, "ratecard.read", {}, () =>
          repo.listVersions(p.data.name),
        ),
      ),
    );
  }

  /**
   * The version whose effective window covers `onDate`: the ACTIVE one, or a RETIRED one for a
   * historic date. Used by pricing (M3-02). A DRAFT is never returned.
   */
  async function findEffectiveVersion(token: string | undefined | null, input: unknown) {
    const p = parse(rateCardEffectiveSchema, input);
    if (!p.ok) return p;
    return settle<RateCardVersion>(async () =>
      unwrap(
        await runAuthorized(guardDeps, token, "ratecard.read", {}, async () => {
          const versions = await repo.listVersions(p.data.name);
          if (versions.length === 0) throw new RateCardError("CATALOG_NOT_FOUND");
          const hit = versions.find(
            (v) =>
              v.status !== "DRAFT" &&
              v.effectiveFrom <= p.data.onDate &&
              (v.effectiveTo === null || p.data.onDate <= v.effectiveTo),
          );
          if (!hit) throw new RateCardError("NOT_ACTIVE");
          return hit;
        }),
      ),
    );
  }

  return {
    createDraft,
    discardDraft,
    activate,
    addItem,
    updateItem,
    removeItem,
    confirmItemValue,
    addPackage,
    updatePackage,
    setPackageBenefits,
    getVersion,
    listVersions,
    findEffectiveVersion,
  };
}

export type RateCardService = ReturnType<typeof createRateCardService>;
