import type { Run } from "@/components/admin/admin-panel";
import { Answers, Bars } from "@/components/results";
import { post } from "@/lib/client/api";
import { plural } from "@/lib/client/format";
import type { AdminState, PollStatus } from "@/lib/shared/types";

const STATUS: Record<PollStatus, string> = { draft: "Pas lancé", open: "En cours", closed: "Clôturé" };

/** Carte d'un sondage dans la liste. num : numéro affiché ; active : sondage affiché chez les votants. */
export function PollCard({ poll: p, num, active, run }: { poll: AdminState["polls"][number]; num: number; active: boolean; run: Run }) {
  const live = active && p.status === "open";

  /** Action sur ce sondage, après confirmation si confirmText est donné. */
  const act = (action: string, confirmText?: string): void =>
    run(async () => {
      if (confirmText === undefined || window.confirm(confirmText)) await post("/api/admin/action", { id: p.id, action });
    });

  const editCategory = (): void =>
    run(async () => {
      const category = window.prompt("Catégorie de ce sondage (vide pour la retirer) :", p.category ?? "");
      if (category !== null) await post("/api/admin/category", { id: p.id, category });
    });

  const editReward = (): void =>
    run(async () => {
      const reward = window.prompt(
        "Récompense gagnée en répondant (ex. : 1 café offert). Vide pour la retirer : les QR codes pas encore utilisés seront annulés.",
        p.reward ?? "",
      );
      if (reward !== null) await post("/api/admin/reward", { id: p.id, reward });
    });

  return (
    <article className={active ? "card poll-admin active" : "card poll-admin"}>
      <div className="poll-meta">
        <span className="num">{num}</span>
        <span className={`badge ${p.status}`}>{STATUS[p.status]}</span>
        {active && <span className="badge live">Affiché</span>}
        {p.hub && <span className="badge hub">Dans le hub</span>}
        {p.reveal && <span className="badge">Résultats visibles</span>}
        <span className="badge">{p.kind === "text" ? "Réponse libre" : "Choix"}</span>
        {p.category && <span className="badge category">{p.category}</span>}
        {p.reward && (
          <span className="badge reward" title="Récompenses remises / gagnées">
            {`Récompense : ${p.reward} · ${p.rewards.redeemed}/${p.rewards.issued} remises`}
          </span>
        )}
        <span className="count">{plural(p.results.total, "réponse")}</span>
      </div>
      <h3>{p.question}</h3>
      {p.kind === "choice" ? <Bars options={p.options} results={p.results} /> : <Answers list={p.results.answers} />}
      <div className="actions">
        {!live && (
          <button type="button" className="btn primary" onClick={() => act("open")}>
            {p.status === "draft" ? "Lancer" : "Relancer"}
          </button>
        )}
        {p.status === "open" && (
          <button type="button" className="btn warn" onClick={() => act("close")}>
            Clôturer
          </button>
        )}
        <button type="button" className="btn" onClick={() => act(p.hub ? "unhub" : "hub")}>
          {p.hub ? "Retirer du hub" : "Mettre dans le hub"}
        </button>
        <button type="button" className="btn" onClick={() => act(p.reveal ? "hide" : "reveal")}>
          {p.reveal ? "Masquer les résultats" : "Montrer les résultats"}
        </button>
        <button type="button" className="btn ghost" onClick={editCategory}>
          Catégorie
        </button>
        <button type="button" className="btn ghost" onClick={editReward}>
          Récompense
        </button>
        <button type="button" className="btn ghost" onClick={() => act("reset", "Effacer toutes les réponses de ce sondage ?")}>
          Remettre à zéro
        </button>
        <button type="button" className="btn ghost danger" onClick={() => act("delete", `Supprimer « ${p.question} » ?`)}>
          Supprimer
        </button>
      </div>
    </article>
  );
}
