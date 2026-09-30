import { HttpError, json, readJson, requireStaff, route, str } from "@/lib/server/http";
import { checkReward } from "@/lib/server/store";

/** Vérifie un code scanné sans le valider : { code }. */
export const POST = route(async (req) => {
  const { db } = await requireStaff(req);
  const code = str((await readJson(req)).code);
  if (!code) throw new HttpError(400, "Code manquant");
  return json(await checkReward(db, code));
});
