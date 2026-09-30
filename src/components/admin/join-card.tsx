/** Le QR encode l'adresse du site telle qu'affichée : les deux viennent de location.origin (origin). */
export function JoinCard({ origin }: { origin: string }) {
  return (
    <div className="card join">
      <h2>Rejoindre</h2>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG généré par /api/qr : rien à optimiser, et next/image exigerait images.localPatterns pour le paramètre url */}
      <img src={`/api/qr?url=${encodeURIComponent(origin)}`} alt="QR code pour rejoindre" width={220} height={220} />
      <p className="join-url">{origin.replace(/^https?:\/\//, "")}</p>
    </div>
  );
}
