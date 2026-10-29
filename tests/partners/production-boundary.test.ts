/** FR-200: a production request must never read or write the synthetic mock. */
import { describe, expect, it } from "vitest";
import {
  PATCH as editPartner,
  GET as readPartner,
} from "../../apps/web/app/api/partners/[id]/route";
import { POST as createPartner, GET as listPartners } from "../../apps/web/app/api/partners/route";
import {
  getPartnerService,
  PartnerBackendUnavailableError,
} from "../../apps/web/features/partners/backend";
import { MockPartnerService } from "../../apps/web/features/partners/mock-service";

describe("production partner boundary", () => {
  it("fails closed while no persisted repository and session wiring exist", () => {
    expect(() => getPartnerService()).toThrow(PartnerBackendUnavailableError);
  });

  it("keeps synthetic fixtures available to explicit tests only", () => {
    expect(new MockPartnerService().all()).toHaveLength(2);
    expect(() => getPartnerService()).toThrow(PartnerBackendUnavailableError);
  });

  it("never returns fixture records from the production list endpoint", async () => {
    const response = await listPartners(
      new Request("http://localhost/api/partners", {
        headers: { "x-dev-principal-role": "CRM_LEAD" },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "service_unavailable" });
  });

  it("cannot save a partner while the audited backend is missing", async () => {
    const response = await createPartner(
      new Request("http://localhost/api/partners", {
        method: "POST",
        headers: { "content-type": "application/json", "x-dev-principal-role": "CRM_LEAD" },
        body: JSON.stringify({ name: "Synthetic Example" }),
      }),
    );
    expect(response.status).toBe(503);
  });

  it("cannot read or edit a synthetic contact through production detail routes", async () => {
    const params = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };
    expect((await readPartner(new Request("http://localhost/api/partners/1"), params)).status).toBe(
      503,
    );
    const response = await editPartner(
      new Request("http://localhost/api/partners/1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "dnc",
          contactId: "synthetic",
          doNotContact: true,
          reason: "requested",
        }),
      }),
      params,
    );
    expect(response.status).toBe(503);
  });
});
