import { json, requireAdmin, route } from "../../lib/http.js";
import { adminState } from "../../lib/store.js";

/** Interrogé régulièrement par la page admin. */
export const GET = route(async (req) => {
  const { db } = await requireAdmin(req);
  return json(await adminState(db));
});
