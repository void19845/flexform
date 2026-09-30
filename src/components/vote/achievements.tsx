"use client";

import { useEffect, useRef, useState } from "react";
import { ACHIEVEMENTS, type AchievementState } from "@/lib/shared/achievements";

/** Succès déjà vus sur cet appareil, pour n'annoncer que les nouveaux. */
function loadSeen(pseudo: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(`achievements:${pseudo}`);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function saveSeen(pseudo: string, seen: Set<string>): void {
  try {
    localStorage.setItem(`achievements:${pseudo}`, JSON.stringify([...seen]));
  } catch {
    // stockage indisponible : les succès seront simplement réannoncés au prochain chargement
  }
}

/** Grille des succès, et une annonce quand un succès se débloque. */
export function Achievements({ list, pseudo }: { list: AchievementState[]; pseudo: string }) {
  /** Annonces en attente : la première est affichée */
  const [queue, setQueue] = useState<string[]>([]);
  const seen = useRef<{ pseudo: string; ids: Set<string> } | null>(null);
  const showing = queue.length > 0;

  useEffect(() => {
    // Sans pseudo, ou avant le premier classement, on affiche la grille sans rien annoncer
    if (!pseudo || !list.length) return;
    const unlocked = list.filter((a) => a.unlocked);
    if (seen.current?.pseudo !== pseudo) {
      // Première visite sur cet appareil : les succès déjà obtenus ne sont pas réannoncés
      seen.current = { pseudo, ids: loadSeen(pseudo) ?? new Set(unlocked.map((a) => a.id)) };
      saveSeen(pseudo, seen.current.ids);
    }
    const { ids } = seen.current;
    const fresh = unlocked.filter((a) => !ids.has(a.id));
    if (!fresh.length) return;
    for (const a of fresh) ids.add(a.id);
    saveSeen(pseudo, ids);
    const messages = fresh.map((a) => `Succès débloqué : ${ACHIEVEMENTS.find((d) => d.id === a.id)!.title}`);
    setQueue((q) => [...q, ...messages]);
  }, [list, pseudo]);

  // Une annonce à la fois, 3,5 s chacune ; une nouvelle annonce ne prolonge pas celle affichée
  useEffect(() => {
    if (!showing) return;
    const timer = window.setInterval(() => setQueue((q) => q.slice(1)), 3500);
    return () => window.clearInterval(timer);
  }, [showing]);

  return (
    <>
      <section className="card achievements">
        {list.length > 0 && (
          <>
            <h2>{`Succès · ${list.filter((a) => a.unlocked).length} / ${list.length}`}</h2>
            <ul className="achievement-grid">
              {list.map((a) => {
                const def = ACHIEVEMENTS.find((d) => d.id === a.id)!;
                return (
                  <li key={a.id} className={a.unlocked ? "achievement unlocked" : "achievement"} title={def.description}>
                    <span className="achievement-body">
                      <span className="achievement-state">{a.unlocked ? "Débloqué" : (a.progress ?? "À débloquer")}</span>
                      <strong>{def.title}</strong>
                      <small>{def.description}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      <p className="toast achievement-toast" role="status" hidden={!showing}>
        {queue[0]}
      </p>
    </>
  );
}
