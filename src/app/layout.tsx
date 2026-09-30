import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sondages AG · BDE Montreuil",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2A1B5E",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // La CSP de src/proxy.ts change de nonce à chaque requête : les pages doivent être rendues à la demande
  await connection();
  return (
    <html lang="fr">
      <head>
        {/* Apparence liée à Flexfolio (palette, polices) ; vide quand le site est délié.
            Feuille générée à chaque requête par /api/theme : elle ne peut pas être importée comme globals.css. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/api/theme" />
      </head>
      <body>{children}</body>
    </html>
  );
}
