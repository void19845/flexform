import { json, requireStaff, route } from "@/lib/server/http";
import { staffPolls } from "@/lib/server/store";

/** Sondages réservés au staff et ouverts, avec la réponse du compte connecté. */
export const GET = route(async (req) => {
  const { db, userId } = await requireStaff(req);
  return json(await staffPolls(db, userId));
});
