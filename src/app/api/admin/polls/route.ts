import { HttpError, json, readJson, requireAdmin, route, str } from "@/lib/server/http";
import { createPoll } from "@/lib/server/store";
import { MAX_CATEGORY_LENGTH, MAX_REWARD_LENGTH } from "@/lib/shared/types";

/** Création d'un sondage. */
export const POST = route(async (req) => {
  const { db } = await requireAdmin(req);
  const body = await readJson(req);
  const question = str(body.question);
  const kind = body.kind === "text" ? "text" : "choice";
  const options = Array.isArray(body.options) ? body.options.map(str).filter(Boolean) : [];
  if (!question || question.length > 200) throw new HttpError(400, "Question requise (200 caractères max)");
  if (kind === "choice" && (options.length < 2 || options.length > 8 || options.some((o) => o.length > 80))) {
    throw new HttpError(400, "Il faut entre 2 et 8 choix (80 caractères max chacun)");
  }
  const category = str(body.category).replace(/\s+/g, " ");
  if (category.length > MAX_CATEGORY_LENGTH) throw new HttpError(400, `Catégorie : ${MAX_CATEGORY_LENGTH} caractères max`);
  const reward = str(body.reward).replace(/\s+/g, " ");
  if (reward.length > MAX_REWARD_LENGTH) throw new HttpError(400, `Récompense : ${MAX_REWARD_LENGTH} caractères max`);
  await createPoll(db, question, kind, options, { hub: body.hub === true, category, reward });
  return json({ ok: true }, 201);
});
