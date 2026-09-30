import { json, route, sessionCookie, sessionIdOf } from "../lib/http.js";
import { logout } from "../lib/store.js";

export const POST = route(async (req) => {
  const sessionId = sessionIdOf(req);
  if (sessionId) await logout(sessionId);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(req, null) });
});
