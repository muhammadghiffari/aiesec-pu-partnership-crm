import { CORE_PACKAGE_NAME } from "@crm/core";
import { NextResponse } from "next/server";

/**
 * Scaffold-only liveness endpoint (E0 tasks). Serves no CRM data.
 * Readiness (DB/config/redis checks) belongs to M0-04's config contract.
 */
export function GET() {
  return NextResponse.json({ status: "ok", service: "web", domainCore: CORE_PACKAGE_NAME });
}
