import { HttpError, json, readJson, requireAdmin, route, str } from "../../lib/http.js";
import { setReward } from "../../lib/store.js";
import { MAX_REWARD_LENGTH } from "../../shared/types.js";

/** Change la récompense d'un sondage : { id, reward }. Une récompense vide la retire. */
export const POST = route(async (req) => {
  const { db } = await requireAdmin(req);
  const body = await readJson(req);
  const reward = str(body.reward).replace(/\s+/g, " ");
  if (reward.length > MAX_REWARD_LENGTH) throw new HttpError(400, `Récompense : ${MAX_REWARD_LENGTH} caractères max`);
  await setReward(db, str(body.id), reward);
  return json({ ok: true });
});
