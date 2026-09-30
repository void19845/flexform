import { json, readJson, requireStaff, route, str } from "@/lib/server/http";
import { redeemReward } from "@/lib/server/store";

/** Valide la remise d'une récompense : { code }. Un code ne peut être validé qu'une fois. */
export const POST = route(async (req) => {
  const { db, userId } = await requireStaff(req);
  return json(await redeemReward(db, userId, str((await readJson(req)).code)));
});
