/** FR-200: authenticated persisted Partner directory and creation. */
import { withPartnerBackend } from "@/features/partners/backend";
import { createPartnerHttp } from "@/features/partners/http";

const handlers = createPartnerHttp(withPartnerBackend);
export const GET = handlers.list;
export const POST = handlers.create;
