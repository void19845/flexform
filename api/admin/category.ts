import { HttpError, json, readJson, requireAdmin, route, str } from "../../lib/http.js";
import { setCategory } from "../../lib/store.js";
import { MAX_CATEGORY_LENGTH } from "../../shared/types.js";

/** Change la catégorie d'un sondage : { id, category }. Une catégorie vide la retire. */
export const POST = route(async (req) => {
  const { db } = await requireAdmin(req);
  const body = await readJson(req);
  const category = str(body.category).replace(/\s+/g, " ");
  if (category.length > MAX_CATEGORY_LENGTH) throw new HttpError(400, `Catégorie : ${MAX_CATEGORY_LENGTH} caractères max`);
  await setCategory(db, str(body.id), category);
  return json({ ok: true });
});
