import QRCode from "qrcode";
import { HttpError, requireSession, route } from "../lib/http.js";
import { normalizeCode, rewardOwner } from "../lib/store.js";

/**
 * QR code d'une récompense, servi uniquement à son propriétaire. Il encode l'adresse de la page
 * staff avec le code : scanné avec l'appareil photo d'un téléphone, il ouvre directement la vérification.
 */
export const GET = route(async (req) => {
  const { sessionId } = await requireSession(req);
  const url = new URL(req.url);
  const code = normalizeCode(url.searchParams.get("code") ?? "");
  if (!code || (await rewardOwner(code)) !== sessionId) throw new HttpError(404, "Récompense introuvable");

  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const svg = await QRCode.toString(`${proto}://${host}/staff?code=${code}`, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#2A1B5E", light: "#FFFFFF" },
  });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" } });
});
