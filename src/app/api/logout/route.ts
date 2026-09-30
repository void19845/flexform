import { json, route, sessionCookie, sessionIdOf } from "@/lib/server/http";
import { logout } from "@/lib/server/store";

export const POST = route(async (req) => {
  const sessionId = sessionIdOf(req);
  if (sessionId) await logout(sessionId);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(req, null) });
});
