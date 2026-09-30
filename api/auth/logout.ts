import { json, route, signOut } from "../../lib/http.js";

export const POST = route(async (req) => {
  signOut(req);
  return json({ ok: true });
});
