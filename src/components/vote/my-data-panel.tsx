"use client";

import { useEffect, useState } from "react";
import { api, post } from "@/lib/client/api";
import { downloadFile } from "@/lib/client/download";
import { dateTimeFmt, plural } from "@/lib/client/format";
import type { Consent, MyData } from "@/lib/shared/types";

type Choices = Pick<Consent, "marketing" | "sponsors">;

/** Mes données (RGPD) : consultation, modification des consentements, téléchargement et suppression. */
export function MyDataPanel({ onErased }: { onErased: () => void }) {
  const [data, setData] = useState<MyData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choices>({ marketing: false, sponsors: false });
  const [saved, setSaved] = useState("");

  // Rechargées à chaque ouverture du panneau
  useEffect(() => {
    let ignore = false;
    api<MyData>("/api/privacy").then(
      (d) => {
        if (ignore) return;
        setData(d);
        setChoices({ marketing: d.profile.consent?.marketing ?? false, sponsors: d.profile.consent?.sponsors ?? false });
      },
      (err: Error) => {
        if (!ignore) setLoadError(err.message);
      },
    );
    return () => {
      ignore = true;
    };
  }, []);

  if (loadError !== null) {
    return (
      <section className="card my-data">
        <p className="error">{loadError}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="card my-data">
        <p className="muted">Chargement…</p>
      </section>
    );
  }
  const { profile } = data;

  // Enregistré dès qu'une case change
  async function save(next: Choices): Promise<void> {
    setChoices(next);
    setSaved("Enregistrement…");
    try {
      await post("/api/privacy", next);
      setSaved("Choix enregistrés.");
    } catch (err) {
      setSaved((err as Error).message);
    }
  }

  async function erase(): Promise<void> {
    if (!confirm("Supprimer ton profil, toutes tes réponses et tes récompenses ? C'est définitif.")) return;
    try {
      await api("/api/privacy", { method: "DELETE" });
      onErased();
    } catch (err) {
      setSaved((err as Error).message);
    }
  }

  return (
    <section className="card my-data">
      <h2>Mes données</h2>
      <dl className="data-list">
        <dt>Nom</dt>
        <dd>{`${profile.prenom} ${profile.nom}`.trim() || "—"}</dd>
        <dt>Formation</dt>
        <dd>{profile.formation || "—"}</dd>
        <dt>Pseudo</dt>
        <dd>{profile.pseudo}</dd>
        <dt>Réponses</dt>
        <dd>{plural(data.answers.length, "sondage")}</dd>
        <dt>Politique acceptée</dt>
        <dd>{profile.consent ? `le ${dateTimeFmt.format(profile.consent.acceptedAt)}` : "—"}</dd>
      </dl>
      <label className="check">
        <input type="checkbox" checked={choices.marketing} onChange={(e) => void save({ ...choices, marketing: e.target.checked })} />
        <span>Le BDE peut utiliser mes réponses, mon nom et ma formation pour sa communication et ses actions marketing.</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={choices.sponsors} onChange={(e) => void save({ ...choices, sponsors: e.target.checked })} />
        <span>Le BDE peut transmettre mes réponses, mon nom et ma formation à ses partenaires et sponsors.</span>
      </label>
      <p className="hint" role="status">
        {saved}
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => downloadFile(`mes-donnees-${profile.pseudo}.json`, JSON.stringify(data, null, 2), "application/json")}
        >
          Télécharger mes données
        </button>
        <button type="button" className="btn ghost danger" onClick={() => void erase()}>
          Supprimer mes données
        </button>
      </div>
      <p className="muted small">
        <a href="/confidentialite" target="_blank" rel="noopener">
          Politique de confidentialité
        </a>
      </p>
    </section>
  );
}
