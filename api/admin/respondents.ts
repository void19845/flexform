import { json, requireAdmin, route } from "../../lib/http.js";
import { respondents } from "../../lib/store.js";

/** Personnes ayant répondu aux sondages, pour la recherche et l'export CSV. */
export const GET = route(async (req) => {
  const { db } = await requireAdmin(req);
  return json(await respondents(db));
});
