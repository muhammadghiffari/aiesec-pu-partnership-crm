/**
 * M1-03 draft API. Backend discovery fails closed until authenticated,
 * audited persisted partner/contact services are connected (HANDOVER.md).
 */

import { NextResponse } from "next/server";
import {
  getPartnerPrincipal,
  getPartnerService,
  PartnerBackendUnavailableError,
} from "@/features/partners/backend";
import { PartnerAccessDeniedError } from "@/features/partners/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const industryParam = url.searchParams.get("industry");
  try {
    const partners = await getPartnerService().search(
      getPartnerPrincipal(),
      query,
      industryParam === null || industryParam === "" ? null : (industryParam as never),
    );
    return NextResponse.json({ partners });
  } catch (error) {
    if (error instanceof PartnerBackendUnavailableError) {
      return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
    }
    if (error instanceof PartnerAccessDeniedError) {
      return NextResponse.json({ error: "access_denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const result = await getPartnerService().create(getPartnerPrincipal(), body);
    if (result.ok) return NextResponse.json({ partner: result.data }, { status: 201 });
    if (result.error === "validation_failed") {
      return NextResponse.json({ error: result.error, issues: result.issues }, { status: 422 });
    }
    if (result.error === "duplicate_confirmation_required") {
      return NextResponse.json(
        { error: result.error, duplicates: result.duplicates },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: result.error }, { status: 403 });
  } catch (error) {
    if (error instanceof PartnerBackendUnavailableError) {
      return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
    }
    if (error instanceof PartnerAccessDeniedError) {
      return NextResponse.json({ error: "access_denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
