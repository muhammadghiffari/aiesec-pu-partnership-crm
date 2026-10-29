import type { PartnerPrincipal, PartnerService } from "./types";

/** No production repository, audit transaction adapter or web session store exists yet. */
export class PartnerBackendUnavailableError extends Error {
  constructor() {
    super("Partner persistence and authenticated session wiring are not available");
    this.name = "PartnerBackendUnavailableError";
  }
}

export function getPartnerService(): PartnerService {
  throw new PartnerBackendUnavailableError();
}

/** Never infer identity from a request header; wait for the real session adapter. */
export function getPartnerPrincipal(): PartnerPrincipal {
  throw new PartnerBackendUnavailableError();
}
