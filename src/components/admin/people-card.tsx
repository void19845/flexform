import type { Run } from "@/components/admin/admin-panel";
import { post } from "@/lib/client/api";
import type { AdminState } from "@/lib/shared/types";

/** Participants connectés et qui a répondu au sondage affiché. Carte vide tant que le premier état n'est pas arrivé. */
export function PeopleCard({ state, run }: { state: AdminState | null; run: Run }) {
  if (!state) return <div className="card people" />;
  const { participants } = state;
  const voted = participants.filter((p) => p.voted).length;
  return (
    <div className="card people">
      <h2>{`Participants · ${participants.length}`}</h2>
      {state.activePollId && <p className="muted">{`${voted} / ${participants.length} ont répondu au sondage affiché`}</p>}
      {participants.length ? (
        <ul className="people-list">
          {participants.map((p) => (
            <li key={p.id}>
              <span className="pseudo">
                {p.pseudo}
                {(p.prenom || p.nom) && (
                  <small>{[p.prenom, p.nom].filter(Boolean).join(" ") + (p.formation ? ` · ${p.formation}` : "")}</small>
                )}
              </span>
              {p.voted && <span className="voted">a répondu</span>}
              <button
                type="button"
                className="btn icon"
                title="Déconnecter"
                onClick={() =>
                  run(async () => {
                    if (window.confirm(`Déconnecter ${p.pseudo} et libérer son pseudo ?`)) await post("/api/admin/kick", { id: p.id });
                  })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{"Personne pour l'instant."}</p>
      )}
    </div>
  );
}
