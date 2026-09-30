import type { PollOption, PollResults } from "@/lib/shared/types";

/** Barres de résultats d'un sondage à choix. mine : le choix du votant, mis en avant. */
export function Bars({ options, results, mine }: { options: PollOption[]; results: PollResults; mine?: string | null }) {
  return (
    <div className="bars">
      {options.map((o, i) => {
        const n = results.counts[o.id] ?? 0;
        const pct = results.total ? Math.round((n / results.total) * 100) : 0;
        return (
          <div key={o.id} className={o.id === mine ? "bar mine" : "bar"}>
            <div className="bar-label">
              <span>{o.label}</span>
              <span className="bar-num">{`${pct} % · ${n}`}</span>
            </div>
            <div className="bar-track">
              <div className={`bar-fill c${i % 4}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Réponses libres, anonymes. */
export function Answers({ list }: { list: string[] }) {
  if (!list.length) return <p className="muted">Pas encore de réponse.</p>;
  return (
    <ul className="answers">
      {list.map((a, i) => (
        <li key={i}>{a}</li>
      ))}
    </ul>
  );
}
