import { json, requireAdmin, route } from "@/lib/server/http";
import { adminState } from "@/lib/server/store";

/** Interrogé régulièrement par la page admin. */
export const GET = route(async (req) => {
  const { db } = await requireAdmin(req);
  return json(await adminState(db));
});
