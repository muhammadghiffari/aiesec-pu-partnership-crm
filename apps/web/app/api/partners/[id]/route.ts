/**
 * Server-side API boundary for a single partner (M1-03 mock-boundary slice):
 * read, edit master fields, set contact verification and do-not-contact.
 */

import { NextResponse } from "next/server";
import {
  getPartnerPrincipal,
  getPartnerService,
  PartnerBackendUnavailableError,
} from "@/features/partners/backend";
import { PartnerAccessDeniedError } from "@/features/partners/types";

type PatchBody = { kind: "partner" | "verify" | "dnc" } & Record<string, unknown>;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const partner = await getPartnerService().getById(getPartnerPrincipal(), id);
    if (!partner) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ partner });
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const service = getPartnerService();
    const principal = getPartnerPrincipal();
    const result =
      body.kind === "verify"
        ? await service.setContactVerification(principal, id, body)
        : body.kind === "dnc"
          ? await service.setDoNotContact(principal, id, body)
          : await service.update(principal, id, body);
    if (result.ok) return NextResponse.json({ data: result.data });
    if (result.error === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (result.error === "validation_failed") {
      return NextResponse.json({ error: result.error, issues: result.issues }, { status: 422 });
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
