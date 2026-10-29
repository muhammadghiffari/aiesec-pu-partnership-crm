/**
 * Same-origin check for cookie-authenticated mutations.
 *
 * `request.url` is not a reliable public origin: Next.js may report an internal
 * host (for example `localhost`) while the browser used `127.0.0.1`, and a TLS
 * proxy terminates HTTPS before the request reaches the app. Compare the
 * browser `Origin` with the request Host and, when a trusted proxy supplies it,
 * the forwarded protocol. A missing Origin is rejected so non-browser clients
 * must opt in explicitly.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
  if (!host || originUrl.host !== host.toLowerCase()) return false;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto
    ? `${forwardedProto.toLowerCase()}:`
    : new URL(request.url).protocol;
  return originUrl.protocol === protocol;
}
