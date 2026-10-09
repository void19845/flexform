"use client";

import { useState, type FormEvent } from "react";
import type { Run } from "@/components/admin/admin-panel";
import { post } from "@/lib/client/api";
import { MAX_CATEGORY_LENGTH, MAX_REWARD_LENGTH, type PollKind } from "@/lib/shared/types";

const EMPTY = { question: "", kind: "choice" as PollKind, options: "", category: "", reward: "", hub: false, staffOnly: false };

/** Formulaire de création. categories : catégories existantes, proposées en suggestions du champ Catégorie. */
export function CreatePollForm({ categories, run, flash }: { categories: string[]; run: Run; flash: (message: string) => void }) {
  const [draft, setDraft] = useState(EMPTY);
  const edit = (change: Partial<typeof EMPTY>): void => setDraft((d) => ({ ...d, ...change }));

  function submit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    run(async () => {
      // Un sondage réservé au staff n'a pas de récompense
      await post("/api/admin/polls", { ...draft, options: draft.options.split("\n"), reward: draft.staffOnly ? "" : draft.reward });
      setDraft(EMPTY);
      flash("Sondage ajouté");
    });
  }

  return (
    <form className="card create" onSubmit={submit}>
      <h2>Nouveau sondage</h2>
      <label className="field">
        <span>Question</span>
        <input
          type="text"
          maxLength={200}
          placeholder="Ta question"
          required
          value={draft.question}
          onChange={(e) => edit({ question: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Type</span>
        <select value={draft.kind} onChange={(e) => edit({ kind: e.target.value as PollKind })}>
          <option value="choice">Choix multiples</option>
          <option value="text">Réponse libre</option>
        </select>
      </label>
      <label className="field" hidden={draft.kind === "text"}>
        <span>Choix (un par ligne)</span>
        <textarea rows={4} placeholder={"Pour\nContre\nAbstention"} value={draft.options} onChange={(e) => edit({ options: e.target.value })} />
      </label>
      <label className="field">
        <span>Catégorie (facultatif)</span>
        <input
          type="text"
          maxLength={MAX_CATEGORY_LENGTH}
          placeholder="Ex. : Votes AG"
          list="categories"
          value={draft.category}
          onChange={(e) => edit({ category: e.target.value })}
        />
        {/* Options gardées d'un rafraîchissement à l'autre (clé = catégorie), pour ne pas fermer les suggestions ouvertes */}
        <datalist id="categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="check">
        <input type="checkbox" checked={draft.staffOnly} onChange={(e) => edit({ staffOnly: e.target.checked })} />
        <span>
          Réservé au staff <em>(jamais montré aux votants ; le staff y répond depuis Flexstaff, page /staff)</em>
        </span>
      </label>
      <label className="field" hidden={draft.staffOnly}>
        <span>Récompense en répondant (facultatif, QR code à usage unique)</span>
        <input
          type="text"
          maxLength={MAX_REWARD_LENGTH}
          placeholder="Ex. : 1 café offert"
          value={draft.reward}
          onChange={(e) => edit({ reward: e.target.value })}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={draft.hub} onChange={(e) => edit({ hub: e.target.checked })} />
        <span>{draft.staffOnly ? "Ouvrir tout de suite au staff" : "Mettre dans le hub de l'accueil (ouvert sans limite de temps)"}</span>
      </label>
      <button type="submit" className="btn primary">
        Ajouter le sondage
      </button>
    </form>
  );
}
