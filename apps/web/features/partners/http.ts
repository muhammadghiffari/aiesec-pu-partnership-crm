/** FR-200: thin HTTP adapter; auth, validation and mutations live in @crm/core. */
import { NextResponse } from "next/server";
import {
  type createPersistedBackend,
  PartnerBackendUnavailableError,
  readSessionCookie,
} from "./backend";
import { isSameOrigin } from "./request-origin";

type Backend = ReturnType<typeof createPersistedBackend>;
type Runner = <T>(work: (backend: Backend) => Promise<T>) => Promise<T>;
type Result = {
  ok: boolean;
  value?: unknown;
  code?: string;
  httpStatus?: number;
  issues?: unknown;
  duplicates?: unknown;
};
function response(result: Result, key: string, status = 200) {
  if (result.ok)
    return NextResponse.json(
      { [key]: result.value },
      { status, headers: { "cache-control": "no-store" } },
    );
  const code =
    result.httpStatus === 401
      ? "authentication_required"
      : result.httpStatus === 403
        ? "forbidden"
        : (result.code ?? "internal_error");
  return NextResponse.json(
    {
      error: code,
      ...(result.issues ? { issues: result.issues } : {}),
      ...(result.duplicates ? { duplicates: result.duplicates } : {}),
    },
    { status: result.httpStatus ?? 500, headers: { "cache-control": "no-store" } },
  );
}
function failed(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof PartnerBackendUnavailableError ? "service_unavailable" : "internal_error",
    },
    {
      status: error instanceof PartnerBackendUnavailableError ? 503 : 500,
      headers: { "cache-control": "no-store" },
    },
  );
}
async function body(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
export function createPartnerHttp(run: Runner) {
  return {
    async list(request: Request) {
      try {
        const url = new URL(request.url);
        const result = await run(({ partners }) =>
          partners.search(readSessionCookie(request.headers), {
            q: url.searchParams.get("q") ?? "",
            industry: url.searchParams.get("industry") || null,
          }),
        );
        return response(result, "partners");
      } catch (error) {
        return failed(error);
      }
    },
    async get(request: Request, { params }: { params: Promise<{ id: string }> }) {
      try {
        const { id } = await params;
        const result = await run(({ partners }) =>
          partners.getById(readSessionCookie(request.headers), id),
        );
        return response(result, "partner");
      } catch (error) {
        return failed(error);
      }
    },
    async create(request: Request) {
      if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const input = await body(request);
      if (input === null) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
      try {
        const result = await run(({ partners }) =>
          partners.create(readSessionCookie(request.headers), input),
        );
        return response(result, "partner", 201);
      } catch (error) {
        return failed(error);
      }
    },
    async patch(request: Request, { params }: { params: Promise<{ id: string }> }) {
      if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const raw = await body(request);
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
      const { kind, ...input } = raw as Record<string, unknown>;
      try {
        const { id } = await params;
        const token = readSessionCookie(request.headers);
        const result = await run(async ({ partners }): Promise<Result> => {
          if (kind === "partner") return partners.update(token, id, input);
          if (kind === "contact") return partners.createContact(token, id, input);
          if (kind === "contact_edit") return partners.updateContact(token, id, input);
          if (kind === "verify") return partners.setVerification(token, id, input);
          if (kind === "dnc") return partners.setDnc(token, id, input);
          return Promise.resolve({
            ok: false as const,
            code: "validation_failed",
            httpStatus: 422,
          });
        });
        return response(result, "data");
      } catch (error) {
        return failed(error);
      }
    },
  };
}
