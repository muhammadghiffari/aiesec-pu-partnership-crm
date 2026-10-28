/**
 * Lifecycle service (FR-200). Every operation:
 *   1. validates untrusted input with Zod (before touching storage),
 *   2. is authorized through the M0-05 guard (`cycle.write` / `cycle.read`), no UI trust,
 *   3. runs inside the M0-06 audited transaction, so the change and its audit event commit
 *      together, and a rejected operation leaves neither,
 *   4. rechecks every precondition INSIDE the transaction (no check-then-act race).
 *
 * Stage moves are strictly forward and single-step with hard prerequisites. Sales status,
 * approach method and partnership status are changed by their own operations and never move
 * the stage; the re-raise decision is not written here (M5-03).
 */

import { z } from "zod";
import type { AuditService } from "../audit/service";
import { type GuardDeps, runAuthorized } from "../auth/guard";
import { type Clock, systemClock } from "../auth/types";
import {
  APPROACH_METHODS,
  type ApproachMethod,
  canChangeApproachMethod,
  canChangePartnershipStatus,
  canChangeSalesStatus,
  canMovePartnershipStatus,
  checkTransition,
  type EssmStage,
  type GateCode,
  isWaivable,
  nextStage,
  PARTNERSHIP_STATUSES,
  type PartnershipStatus,
  SALES_STATUSES,
  type SalesStatus,
  unmetGates,
} from "./rules";
import {
  type CycleRecord,
  httpStatusFor,
  LifecycleError,
  type LifecycleErrorCode,
  type LifecycleFailure,
  type LifecycleRepository,
  type LifecycleResult,
} from "./types";

const uuid = z.uuid();
const reason = z.string().trim().min(10).max(500);
const shortReason = z.string().trim().min(3).max(200);

export const openCycleSchema = z.strictObject({
  partnerId: uuid,
  projectSupport: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  approachMethod: z.enum(APPROACH_METHODS),
});
export const advanceStageSchema = z.strictObject({
  cycleId: uuid,
  /** The stage the caller believes the cycle is in; guards against stale screens and replays. */
  expectedStage: z.string(),
  waiver: z.strictObject({ reason }).optional(),
});
export const salesStatusSchema = z.strictObject({ cycleId: uuid, status: z.enum(SALES_STATUSES) });
export const approachMethodSchema = z.strictObject({
  cycleId: uuid,
  method: z.enum(APPROACH_METHODS),
});
export const partnershipStatusSchema = z.strictObject({
  cycleId: uuid,
  status: z.enum(PARTNERSHIP_STATUSES),
  reason: shortReason.optional(),
});

export interface LifecycleDeps {
  guard: Pick<GuardDeps, "sessions">;
  audit: AuditService;
  repository: LifecycleRepository;
  clock?: Clock;
  newId?: () => string;
}

function fail(code: LifecycleErrorCode, extra: Partial<LifecycleFailure> = {}): LifecycleFailure {
  return { ok: false, code, httpStatus: httpStatusFor(code), ...extra };
}

export function createLifecycleService(deps: LifecycleDeps) {
  const { repository: repo, audit } = deps;
  const clock = deps.clock ?? systemClock;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const guardDeps: GuardDeps = {
    sessions: deps.guard.sessions,
    onDecision: (event) => audit.recordDenial(event),
  };

  /** Run `body`, converting domain errors (thrown to roll the transaction back) into results. */
  async function settle<T>(
    run: () => Promise<{ ok: true; value: T } | { ok: false; code: string; httpStatus: number }>,
  ): Promise<LifecycleResult<T>> {
    try {
      return (await run()) as LifecycleResult<T>;
    } catch (error) {
      if (error instanceof LifecycleError) {
        const waivable = error.gates?.filter(isWaivable);
        return fail(error.code, {
          ...(error.gates ? { gates: error.gates } : {}),
          ...(waivable && waivable.length > 0 ? { waivableGates: waivable } : {}),
        });
      }
      throw error;
    }
  }

  function validation<T>(
    schema: z.ZodType<T>,
    input: unknown,
  ): { ok: true; data: T } | LifecycleFailure {
    const parsed = schema.safeParse(input);
    return parsed.success ? { ok: true, data: parsed.data } : fail("VALIDATION_FAILED");
  }

  async function loadOpenCycle(cycleId: string): Promise<CycleRecord> {
    const cycle = await repo.getCycle(cycleId);
    if (!cycle) throw new LifecycleError("CYCLE_NOT_FOUND");
    if (cycle.closedAt !== null) throw new LifecycleError("CYCLE_CLOSED");
    return cycle;
  }

  /** Guard/audit results (success or denial) -> lifecycle result. Denials pass through as-is. */
  const unwrap = <T>(
    r: { ok: true; value: unknown } | { ok: false; code: string; httpStatus: number },
  ): LifecycleResult<T> => (r.ok ? { ok: true, value: r.value as T } : (r as LifecycleFailure));

  // ---------------------------------------------------------------------------------------------

  async function openCycle(token: string | undefined | null, input: unknown) {
    const v = validation(openCycleSchema, input);
    if (!v.ok) return v;
    const data = v.data;
    return settle<CycleRecord>(async () =>
      unwrap<CycleRecord>(
        await audit.audited(
          token,
          { action: "cycle.write", kind: "MUTATION", entityType: "partnership_cycle" },
          async () => {
            if (!(await repo.partnerExists(data.partnerId)))
              throw new LifecycleError("PARTNER_NOT_FOUND");
            // A partner's later cycles are created by the Re-Raise decision (M5-03), never here.
            if ((await repo.listCyclesForPartner(data.partnerId)).length > 0) {
              throw new LifecycleError("HAS_EXISTING_CYCLE");
            }
            const cycle: CycleRecord = {
              cycleId: newId(),
              partnerId: data.partnerId,
              cycleNumber: 1,
              previousCycleId: null,
              salesType: "NEW",
              salesStatus: "ACTIVE",
              approachMethod: data.approachMethod,
              essmStage: "PROSPECTING",
              partnershipStatus: null,
              reRaiseDecision: null,
              projectSupport: data.projectSupport,
              openedAt: clock.now(),
              closedAt: null,
            };
            await repo.insertCycle(cycle);
            return {
              value: cycle,
              entityId: cycle.cycleId,
              metadata: {
                cycleNumber: 1,
                essmStage: cycle.essmStage,
                salesType: cycle.salesType,
                approachMethod: cycle.approachMethod,
                projectSupport: cycle.projectSupport,
              },
            };
          },
        ),
      ),
    );
  }

  async function getCycle(token: string | undefined | null, cycleId: unknown) {
    const v = validation(uuid, cycleId);
    if (!v.ok) return v;
    return settle<CycleRecord>(async () => {
      const r = await runAuthorized(guardDeps, token, "cycle.read", {}, async () => {
        const c = await repo.getCycle(v.data);
        if (!c) throw new LifecycleError("CYCLE_NOT_FOUND");
        return c;
      });
      return unwrap<CycleRecord>(r);
    });
  }

  async function listCycles(token: string | undefined | null, partnerId: unknown) {
    const v = validation(uuid, partnerId);
    if (!v.ok) return v;
    return settle<CycleRecord[]>(async () =>
      unwrap<CycleRecord[]>(
        await runAuthorized(guardDeps, token, "cycle.read", {}, () =>
          repo.listCyclesForPartner(v.data),
        ),
      ),
    );
  }

  /** Recompute everything inside the transaction; this is what actually gates the move. */
  async function evaluate(cycleId: string, expectedStage: string) {
    const cycle = await loadOpenCycle(cycleId);
    if (cycle.essmStage !== expectedStage) throw new LifecycleError("STALE_STAGE");
    const to = nextStage(cycle.essmStage);
    if (to === null) throw new LifecycleError("TERMINAL_STAGE");
    const structural = checkTransition(cycle.essmStage, to);
    if (!structural.allowed) throw new LifecycleError("STALE_STAGE"); // unreachable by construction
    const unmet = unmetGates(cycle.essmStage, await repo.getFacts(cycleId));
    return { cycle, to, unmet };
  }

  async function applyAdvance(cycle: CycleRecord, to: EssmStage): Promise<void> {
    const patch: Parameters<LifecycleRepository["updateCycle"]>[2] = { essmStage: to };
    // Established-partnership status begins when implementation begins (PRD §8).
    if (to === "PARTNERSHIP_IMPLEMENTATION" && cycle.partnershipStatus === null) {
      patch.partnershipStatus = "ACTIVE";
    }
    if (!(await repo.updateCycle(cycle.cycleId, cycle.essmStage, patch))) {
      throw new LifecycleError("STALE_STAGE");
    }
  }

  async function advanceStage(token: string | undefined | null, input: unknown) {
    const v = validation(advanceStageSchema, input);
    if (!v.ok) return v;
    const { cycleId, expectedStage, waiver } = v.data;

    // Authorize BEFORE reading cycle data so an unauthorized caller cannot probe existence/state.
    const planned = await settle<{ unmet: readonly GateCode[]; from: EssmStage; to: EssmStage }>(
      async () =>
        unwrap(
          await runAuthorized(guardDeps, token, "cycle.write", {}, async () => {
            const { cycle, to, unmet } = await evaluate(cycleId, expectedStage);
            return { unmet, from: cycle.essmStage, to };
          }),
        ),
    );
    if (!planned.ok) return planned;
    const { unmet: plannedUnmet, from, to } = planned.value;

    if (!waiver) {
      return settle<CycleRecord>(async () =>
        unwrap<CycleRecord>(
          await audit.audited(
            token,
            { action: "cycle.write", kind: "MUTATION", entityType: "partnership_cycle" },
            async () => {
              const { cycle, to: target, unmet } = await evaluate(cycleId, expectedStage);
              if (unmet.length > 0) throw new LifecycleError("GATES_UNMET", unmet);
              await applyAdvance(cycle, target);
              const updated = (await repo.getCycle(cycleId)) as CycleRecord;
              return {
                value: updated,
                entityId: cycleId,
                metadata: {
                  fromStage: cycle.essmStage,
                  toStage: target,
                  changedFields:
                    updated.partnershipStatus !== cycle.partnershipStatus
                      ? ["essmStage", "partnershipStatus"]
                      : ["essmStage"],
                },
              };
            },
          ),
        ),
      );
    }

    // Waiver path: only waivable gates, only with gate.override (CRM Lead), always a reason.
    if (plannedUnmet.length === 0) return fail("WAIVER_NOT_NEEDED");
    if (!plannedUnmet.every(isWaivable)) {
      return fail("WAIVER_NOT_ALLOWED", {
        gates: plannedUnmet,
        waivableGates: plannedUnmet.filter(isWaivable),
      });
    }
    const declared = [...plannedUnmet].sort();
    return settle<CycleRecord>(async () =>
      unwrap<CycleRecord>(
        await audit.overrideGate(
          token,
          {
            gate: `${from}>${to}|${declared.join(",")}`,
            entityType: "partnership_cycle",
            entityId: cycleId,
            reason: waiver.reason,
          },
          async () => {
            const { cycle, to: target, unmet } = await evaluate(cycleId, expectedStage);
            const current = [...unmet].sort();
            // The waiver covers exactly the gates the lead was shown; anything else is stale.
            if (current.length !== declared.length || current.some((g, i) => g !== declared[i])) {
              throw new LifecycleError("WAIVER_STALE", unmet);
            }
            if (!unmet.every(isWaivable)) throw new LifecycleError("WAIVER_NOT_ALLOWED", unmet);
            await applyAdvance(cycle, target);
            return (await repo.getCycle(cycleId)) as CycleRecord;
          },
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Separate dimensions. None of these can change essm_stage.
  // ---------------------------------------------------------------------------------------------

  async function updateDimension(
    token: string | undefined | null,
    cycleId: string,
    field: "salesStatus" | "approachMethod" | "partnershipStatus",
    next: SalesStatus | ApproachMethod | PartnershipStatus,
    guardFn: (cycle: CycleRecord) => void,
    extraMeta: Record<string, string> = {},
  ) {
    return settle<CycleRecord>(async () =>
      unwrap<CycleRecord>(
        await audit.audited(
          token,
          { action: "cycle.write", kind: "MUTATION", entityType: "partnership_cycle" },
          async () => {
            const cycle = await loadOpenCycle(cycleId);
            if (cycle[field] === next) throw new LifecycleError("NO_CHANGE");
            guardFn(cycle);
            if (!(await repo.updateCycle(cycleId, cycle.essmStage, { [field]: next }))) {
              throw new LifecycleError("STALE_STAGE");
            }
            return {
              value: (await repo.getCycle(cycleId)) as CycleRecord,
              entityId: cycleId,
              metadata: {
                dimension: field,
                from: cycle[field] ?? "UNSET",
                to: next,
                stage: cycle.essmStage,
                ...extraMeta,
              },
            };
          },
        ),
      ),
    );
  }

  async function setSalesStatus(token: string | undefined | null, input: unknown) {
    const v = validation(salesStatusSchema, input);
    if (!v.ok) return v;
    return updateDimension(token, v.data.cycleId, "salesStatus", v.data.status, (c) => {
      if (!canChangeSalesStatus(c.essmStage))
        throw new LifecycleError("STATUS_NOT_ALLOWED_IN_STAGE");
    });
  }

  async function setApproachMethod(token: string | undefined | null, input: unknown) {
    const v = validation(approachMethodSchema, input);
    if (!v.ok) return v;
    return updateDimension(token, v.data.cycleId, "approachMethod", v.data.method, (c) => {
      if (!canChangeApproachMethod(c.essmStage))
        throw new LifecycleError("STATUS_NOT_ALLOWED_IN_STAGE");
    });
  }

  async function setPartnershipStatus(token: string | undefined | null, input: unknown) {
    const v = validation(partnershipStatusSchema, input);
    if (!v.ok) return v;
    const { cycleId, status, reason: why } = v.data;
    // PRD §8: break/finish record why. The reason is also stored on the audit event.
    if ((status === "BREAK" || status === "FINISH") && !why) return fail("REASON_REQUIRED");
    return updateDimension(
      token,
      cycleId,
      "partnershipStatus",
      status,
      (c) => {
        if (!canChangePartnershipStatus(c.essmStage))
          throw new LifecycleError("STATUS_NOT_ALLOWED_IN_STAGE");
        if (!canMovePartnershipStatus(c.partnershipStatus, status)) {
          throw new LifecycleError("INVALID_PARTNERSHIP_TRANSITION");
        }
      },
      why ? { reason: why } : {},
    );
  }

  /** Read-only preview used by screens: which gates block the next move, and which are waivable. */
  async function previewAdvance(token: string | undefined | null, cycleId: unknown) {
    const v = validation(uuid, cycleId);
    if (!v.ok) return v;
    return settle<{
      from: EssmStage;
      to: EssmStage | null;
      unmet: readonly GateCode[];
      waivable: readonly GateCode[];
    }>(async () =>
      unwrap(
        await runAuthorized(guardDeps, token, "cycle.read", {}, async () => {
          const cycle = await loadOpenCycle(v.data);
          const to = nextStage(cycle.essmStage);
          const unmet = to === null ? [] : unmetGates(cycle.essmStage, await repo.getFacts(v.data));
          return { from: cycle.essmStage, to, unmet, waivable: unmet.filter(isWaivable) };
        }),
      ),
    );
  }

  return {
    openCycle,
    getCycle,
    listCycles,
    advanceStage,
    previewAdvance,
    setSalesStatus,
    setApproachMethod,
    setPartnershipStatus,
  };
}

export type LifecycleService = ReturnType<typeof createLifecycleService>;
