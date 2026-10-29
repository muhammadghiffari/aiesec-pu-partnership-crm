/** FR-200: authenticated persisted Partner and Contact operations. */
import { withPartnerBackend } from "@/features/partners/backend";
import { createPartnerHttp } from "@/features/partners/http";

const handlers = createPartnerHttp(withPartnerBackend);
export const GET = handlers.get;
export const PATCH = handlers.patch;
