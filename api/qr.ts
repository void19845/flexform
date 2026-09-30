import QRCode from "qrcode";
import { HttpError, route } from "../lib/http.js";

/** QR code de l'adresse donnée, limité à l'adresse du site lui-même. */
export const GET = route(async (req) => {
  const requestUrl = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? requestUrl.host;
  let target: URL;
  try {
    target = new URL(requestUrl.searchParams.get("url") ?? "");
  } catch {
    throw new HttpError(400, "Adresse invalide");
  }
  if (target.host !== host || !/^https?:$/.test(target.protocol)) throw new HttpError(400, "Adresse invalide");

  const svg = await QRCode.toString(target.origin, {
    type: "svg",
    margin: 1,
    color: { dark: "#2A1B5E", light: "#FFFFFF" },
  });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
});
