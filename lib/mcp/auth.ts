import { createHash, timingSafeEqual } from "crypto";

// The MCP endpoint has no user session (Claude calls it directly), so auth
// is a single shared bearer token instead of OAuth — same shared-secret
// pattern as the Resend webhook, just carried in an Authorization header.
// Hashing both sides to a fixed-length digest before comparing avoids
// leaking the token's length via timingSafeEqual's size requirement.
export function isAuthorizedMcpRequest(request: Request): boolean {
  const expected = process.env.MCP_ACCESS_TOKEN;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return false;

  const provided = createHash("sha256").update(token).digest();
  const wanted = createHash("sha256").update(expected).digest();
  return timingSafeEqual(provided, wanted);
}
