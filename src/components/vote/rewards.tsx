import { dateTimeFmt, formatCode } from "@/lib/client/format";
import type { MyReward } from "@/lib/shared/types";

/**
 * Mes récompenses : un QR code à usage unique par récompense gagnée, à montrer au staff.
 * Une carte par code (key) : les images ne sont pas rechargées à chaque rafraîchissement.
 */
export function Rewards({ rewards }: { rewards: MyReward[] }) {
  // Les récompenses à récupérer d'abord
  const sorted = [...rewards].sort((a, b) => Number(a.redeemedAt !== null) - Number(b.redeemedAt !== null));
  return (
    <section className="rewards" hidden={rewards.length === 0}>
      <h2 className="hub-title">Mes récompenses</h2>
      {sorted.map((r) =>
        r.redeemedAt === null ? (
          <article key={r.code} className="card reward-card">
            <p className="eyebrow">À récupérer</p>
            <h3 className="reward-text">{r.text}</h3>
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG servi au seul propriétaire (cookie de session) : l'optimiseur de next/image ne peut pas le charger */}
            <img
              className="reward-qr"
              src={`/api/reward-qr?code=${encodeURIComponent(r.code)}`}
              alt={`QR code de la récompense : ${r.text}`}
              width={220}
              height={220}
            />
            <p className="reward-code">{formatCode(r.code)}</p>
            <p className="muted small">{`Montre ce QR code à un membre du staff. Il ne fonctionne qu'une fois. Gagné avec « ${r.question} »`}</p>
          </article>
        ) : (
          <article key={r.code} className="card reward-card used">
            <p className="eyebrow">Récupérée</p>
            <h3 className="reward-text">{r.text}</h3>
            <p className="muted small">{`Remise le ${dateTimeFmt.format(r.redeemedAt)}`}</p>
          </article>
        ),
      )}
    </section>
  );
}
