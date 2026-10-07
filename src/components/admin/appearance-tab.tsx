"use client";

import { useEffect, useState } from "react";
import { api, post } from "@/lib/client/api";
import type { ThemeState } from "@/lib/shared/types";

/** Contenu de l'onglet : null pendant le chargement, puis l'état lu ou l'erreur de lecture. */
type Loaded = { theme: ThemeState } | { error: string } | null;

/** Couleurs montrées dans l'aperçu : rôle Flexdesign -> libellé */
const SWATCHES: [string, string][] = [
  ["background", "Fond"],
  ["surface", "Cartes"],
  ["text", "Texte"],
  ["primary", "Principale"],
  ["accent", "Accent"],
];

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="swatch">
      <span className="swatch-chip" style={{ background: color }} />
      <span>
        <strong>{label}</strong>
        <small>{color}</small>
      </span>
    </div>
  );
}

function ThemeCard({ state: s, onChange }: { state: ThemeState; onChange: (state: ThemeState) => void }) {
  const [choice, setChoice] = useState(s.themeId ?? "");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");

  async function apply(themeId: string | null): Promise<void> {
    setPending(true);
    try {
      const next = await post<ThemeState>("/api/admin/theme", { themeId });
      onChange(next);
      setChoice(next.themeId ?? "");
      setNote("");
    } catch (err) {
      setNote((err as Error).message);
    }
    setPending(false);
  }

  const status = !s.themeId
    ? "Le site utilise le thème du BDE."
    : s.theme
      ? `Le site utilise le thème Flexdesign « ${s.theme.name} ».`
      : "Le thème lié est introuvable dans Flexdesign : le site utilise le thème du BDE.";

  return (
    <div className="card">
      <h2>Apparence</h2>
      <p>{status}</p>
      {s.error ? <p className="error">{`${s.error}.${s.theme ? " Dernier thème connu affiché." : ""}`}</p> : null}
      {s.theme ? (
        <div className="theme-preview">
          <p className="eyebrow">Thème lié</p>
          <div className="swatches">
            {SWATCHES.filter(([role]) => s.theme?.colors[role]).map(([role, label]) => (
              <Swatch key={role} label={label} color={s.theme?.colors[role] ?? ""} />
            ))}
          </div>
          <p className="muted small">{`Titres : ${s.theme.fontTitle ?? "police du BDE"} · Texte : ${s.theme.fontBody ?? "police du BDE"}`}</p>
        </div>
      ) : null}
      <label className="field">
        <span>Thème Flexdesign</span>
        <select value={choice} disabled={pending} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Aucun (thème du BDE)</option>
          {s.themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="actions">
        <button type="button" className="btn primary" disabled={pending || choice === (s.themeId ?? "")} onClick={() => void apply(choice || null)}>
          {choice ? "Lier ce thème" : "Revenir au thème du BDE"}
        </button>
      </div>
      <p className="hint">{note}</p>
      <p className="muted small">
        {"Les changements (ici ou dans Flexdesign) apparaissent chez les visiteurs en une minute environ. Recharge la page pour voir le résultat."}
      </p>
    </div>
  );
}

/** Onglet Apparence : lier le site à un thème Flexdesign, ou garder le thème du BDE. */
export function AppearanceTab({ active }: { active: boolean }) {
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [shown, setShown] = useState(active);
  // Relu à chaque ouverture de l'onglet : « Chargement… » d'abord
  if (active !== shown) {
    setShown(active);
    if (active) setLoaded(null);
  }

  useEffect(() => {
    if (!active) return;
    let current = true;
    api<ThemeState>("/api/admin/theme")
      .then((theme) => {
        if (current) setLoaded({ theme });
      })
      .catch((err: unknown) => {
        if (current) setLoaded({ error: (err as Error).message });
      });
    return () => {
      current = false;
    };
  }, [active]);

  return (
    <section className="appearance" hidden={!active}>
      {loaded === null ? (
        <div className="card">
          <p className="muted">Chargement…</p>
        </div>
      ) : "error" in loaded ? (
        <div className="card">
          <p className="error">{loaded.error}</p>
        </div>
      ) : (
        <ThemeCard key={loaded.theme.themeId ?? ""} state={loaded.theme} onChange={(theme) => setLoaded({ theme })} />
      )}
    </section>
  );
}
