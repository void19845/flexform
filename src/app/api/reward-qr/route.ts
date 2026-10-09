import QRCode from "qrcode";
import { HttpError, requireSession, route } from "@/lib/server/http";
import { normalizeCode, rewardOwner } from "@/lib/server/store";

/**
 * QR code d'une récompense, servi uniquement à son propriétaire. Il encode le code seul, lu par le
 * scanner de la page /staff de Flexstaff.
 */
export const GET = route(async (req) => {
  const { sessionId } = await requireSession(req);
  const url = new URL(req.url);
  const code = normalizeCode(url.searchParams.get("code") ?? "");
  if (!code || (await rewardOwner(code)) !== sessionId) throw new HttpError(404, "Récompense introuvable");

  const svg = await QRCode.toString(code, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#2A1B5E", light: "#FFFFFF" },
  });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" } });
});
