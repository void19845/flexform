import { route } from "@/lib/server/http";
import { themeCss } from "@/lib/server/theme";

/** Feuille de style de l'apparence (thème Flexdesign lié ou non), chargée par toutes les pages. */
export const GET = route(async () => {
  return new Response(await themeCss(), {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      // Mise en cache courte : un changement dans Flexdesign ou dans l'admin s'applique en une minute
      "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    },
  });
});
