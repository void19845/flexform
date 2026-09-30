"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { downloadFile } from "@/lib/client/download";
import { dateTimeFmt, fold, plural, timeFmt } from "@/lib/client/format";
import { usePolling } from "@/lib/client/use-polling";
import type { Respondent, RespondentsState } from "@/lib/shared/types";
import { answersCsv, fileName, respondentsCsv, type Filters, type PollInfo, type Row } from "./respondents-csv";

/** Valeur du filtre pour les sondages sans catégorie */
const NO_CATEGORY = "__sans__";

const CSV_TYPE = "text/csv;charset=utf-8";

const fetchRespondents = () => api<RespondentsState>("/api/admin/respondents");

/** Jour local au format du champ date (AAAA-MM-JJ). */
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fullName(r: Respondent): string {
  return [r.prenom, r.nom].filter(Boolean).join(" ") || "—";
}

function inCategory(p: PollInfo, category: string): boolean {
  if (!category) return true;
  return category === NO_CATEGORY ? !p.category : p.category === category;
}

function categoriesOf(polls: PollInfo[]): string[] {
  return [...new Set(polls.map((p) => p.category).filter((c): c is string => Boolean(c)))].sort();
}

interface Picked {
  category: string;
  poll: string;
}

/** Garde la catégorie et le sondage choisis s'ils sont encore dans les listes, sinon revient à « tous ». */
function keepPicked(polls: PollInfo[], { category, poll }: Picked): Picked {
  const hasCategory = categoriesOf(polls).includes(category) || (category === NO_CATEGORY && polls.some((p) => !p.category));
  const kept = hasCategory ? category : "";
  return { category: kept, poll: polls.some((p) => p.id === poll && inCategory(p, kept)) ? poll : "" };
}

function computeRows(s: RespondentsState, f: Filters): Row[] {
  const query = fold(f.search);
  const polls = s.polls.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => inCategory(p, f.category) && (!f.poll || p.id === f.poll));
  const seen = new Map<string, number>();
  const result: Row[] = [];
  for (const r of s.respondents) {
    const id = [r.pseudo, r.prenom, r.nom, r.formation].join("\n");
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    if (query && !fold(`${r.prenom} ${r.nom} ${r.pseudo} ${r.formation}`).includes(query)) continue;
    if (f.consent === "marketing" && !r.consent?.marketing) continue;
    if (f.consent === "sponsors" && !r.consent?.sponsors) continue;
    const kept = polls.filter(({ p }) => {
      if (!(p.id in r.answers)) return false;
      const at = r.answers[p.id];
      return !f.day || (at !== null && dayKey(at) === f.day);
    });
    if (!kept.length) continue;
    const times = kept.map(({ p }) => r.answers[p.id]).filter((at): at is number => typeof at === "number");
    result.push({
      key: `${id}\n${count}`,
      r,
      kept: kept.map(({ p }) => p),
      polls: kept.map(({ n }) => n),
      first: times.length ? Math.min(...times) : null,
      last: times.length ? Math.max(...times) : null,
    });
  }
  return result.sort((a, b) => fold(`${a.r.nom} ${a.r.prenom}`).localeCompare(fold(`${b.r.nom} ${b.r.prenom}`)));
}

/** Les personnes qui ont répondu au plus de sondages parmi ceux filtrés. Ex æquo : même rang. */
function ranking(rows: Row[]): { rank: number; row: Row }[] {
  const sorted = [...rows].sort((a, b) => b.polls.length - a.polls.length || (a.last ?? Number.MAX_SAFE_INTEGER) - (b.last ?? Number.MAX_SAFE_INTEGER));
  const top: { rank: number; row: Row }[] = [];
  sorted.slice(0, 10).forEach((row, i) => {
    const prev = top[i - 1];
    top.push({ rank: prev && prev.row.polls.length === row.polls.length ? prev.rank : i + 1, row });
  });
  return top;
}

/** Formations regroupées sans tenir compte des majuscules ni des accents */
function formationGroups(rows: Row[]): { key: string; label: string; n: number }[] {
  const groups = new Map<string, { key: string; label: string; n: number }>();
  for (const { r } of rows) {
    const key = fold(r.formation) || "?";
    const g = groups.get(key) ?? { key, label: r.formation || "Non renseignée", n: 0 };
    g.n++;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="card stat">
      <strong>{value}</strong>
      <span className="muted">{label}</span>
    </div>
  );
}

/**
 * Onglet Répondants : qui a répondu, filtré par jour (aujourd'hui par défaut), par sondage
 * et par recherche, avec répartition par formation et export CSV de la liste affichée.
 * Les filtres restent d'un affichage à l'autre ; le serveur n'est interrogé que quand l'onglet est affiché.
 */
export function RespondentsTab({ active, onUnauthorized }: { active: boolean; onUnauthorized: () => void }) {
  const [data, setData] = useState<RespondentsState | null>(null);
  const [connected, setConnected] = useState(true);
  // null jusqu'à la première réponse du serveur, qui fixe le jour par défaut (aujourd'hui)
  const [day, setDay] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked>({ category: "", poll: "" });
  const [consent, setConsent] = useState("");
  const [search, setSearch] = useState("");

  usePolling(
    fetchRespondents,
    5000,
    {
      onState: (s, startedAt) => {
        setData(s);
        setPicked((p) => keepPicked(s.polls, p));
        // L'heure est lue ici, jamais pendant le rendu : pas d'écart entre serveur et navigateur
        setDay((d) => d ?? dayKey(startedAt));
      },
      onStatus: setConnected,
      onUnauthorized,
    },
    active,
  );

  const filters: Filters = { day: day ?? "", category: picked.category, poll: picked.poll, consent, search };
  const rows = data ? computeRows(data, filters) : [];
  const answers = rows.reduce((n, row) => n + row.polls.length, 0);
  const top = ranking(rows);
  const groups = formationGroups(rows);
  const max = groups[0]?.n ?? 1;

  return (
    <section className="respondents" hidden={!active}>
      <div className="card filters">
        <div className="field">
          <span>Jour</span>
          <input type="date" aria-label="Jour" value={day ?? ""} onChange={(e) => setDay(e.target.value)} />
          <div className="quick-days">
            <button type="button" className="btn ghost small" onClick={() => setDay(dayKey(Date.now()))}>
              {"Aujourd'hui"}
            </button>
            <button type="button" className="btn ghost small" onClick={() => setDay("")}>
              Tous les jours
            </button>
          </div>
        </div>
        <label className="field">
          <span>Catégorie</span>
          <select
            aria-label="Catégorie"
            value={picked.category}
            onChange={(e) => {
              const category = e.target.value;
              if (data) setPicked((p) => keepPicked(data.polls, { category, poll: p.poll }));
            }}
          >
            {data && (
              <>
                <option value="">Toutes les catégories</option>
                {categoriesOf(data.polls).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {data.polls.some((p) => !p.category) && <option value={NO_CATEGORY}>Sans catégorie</option>}
              </>
            )}
          </select>
        </label>
        <label className="field">
          <span>Sondage</span>
          <select
            aria-label="Sondage"
            value={picked.poll}
            onChange={(e) => {
              const poll = e.target.value;
              setPicked((p) => ({ ...p, poll }));
            }}
          >
            {data && (
              <>
                <option value="">{picked.category ? "Tous les sondages de la catégorie" : "Tous les sondages"}</option>
                {data.polls
                  .map((p, i) => ({ p, n: i + 1 }))
                  .filter(({ p }) => inCategory(p, picked.category))
                  .map(({ p, n }) => (
                    <option key={p.id} value={p.id}>{`${n}. ${p.question}`}</option>
                  ))}
              </>
            )}
          </select>
        </label>
        <label className="field">
          <span>Consentement</span>
          {/* Avant d'envoyer des données à un sponsor ou de les utiliser en communication, filtrer sur l'accord correspondant */}
          <select aria-label="Consentement" value={consent} onChange={(e) => setConsent(e.target.value)}>
            <option value="">Tout le monde (usage interne)</option>
            <option value="marketing">Accord communication</option>
            <option value="sponsors">Accord sponsors</option>
          </select>
        </label>
        <label className="field grow">
          <span>Recherche</span>
          <input
            type="search"
            placeholder="Nom, prénom, pseudo ou formation…"
            aria-label="Rechercher"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <p className="status" hidden={connected}>
        Connexion perdue, reconnexion…
      </p>
      <div className="stats">
        {data && (
          <>
            <Stat value={rows.length} label={rows.length > 1 ? "répondants" : "répondant"} />
            <Stat value={answers} label={answers > 1 ? "réponses" : "réponse"} />
            <Stat value={groups.length} label={groups.length > 1 ? "formations" : "formation"} />
          </>
        )}
      </div>
      <div className="resp-layout">
        <div className="card table-card">
          {data && (
            <>
              <div className="table-head">
                <h2>{plural(rows.length, "répondant")}</h2>
                <div className="export">
                  <button
                    type="button"
                    className="btn primary"
                    title="Une ligne par personne"
                    disabled={!rows.length}
                    onClick={() => downloadFile(fileName("repondants", data.polls, filters), respondentsCsv(rows), CSV_TYPE)}
                  >
                    {`Répondants (CSV · ${rows.length})`}
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    title="Une ligne par réponse, avec son contenu"
                    disabled={!rows.length}
                    onClick={() => downloadFile(fileName("reponses", data.polls, filters), answersCsv(rows, data.polls), CSV_TYPE)}
                  >
                    {`Réponses (CSV · ${answers})`}
                  </button>
                </div>
              </div>
              {rows.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Nom</th>
                        <th>Formation</th>
                        <th>Pseudo</th>
                        <th>Sondages</th>
                        <th>{filters.day ? "Heure" : "Dernière réponse"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ key, r, polls, last }) => (
                        <tr key={key}>
                          <td className="strong">{r.nom ? `${r.nom.toUpperCase()} ${r.prenom}` : fullName(r)}</td>
                          <td>{r.formation || "—"}</td>
                          <td className="muted">{r.pseudo}</td>
                          <td>{polls.join(", ")}</td>
                          <td className="num-cell">{last ? (filters.day ? timeFmt : dateTimeFmt).format(last) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">{search ? "Aucun résultat pour cette recherche." : "Personne n'a répondu ce jour-là."}</p>
              )}
            </>
          )}
        </div>
        <div className="resp-side">
          <div className="card leaderboard">
            {data && (
              <>
                <h2>Classement</h2>
                {top.length ? (
                  <ol className="rank-list">
                    {top.map(({ rank, row }) => (
                      <li key={row.key}>
                        <span className="rank">{rank}</span>
                        <span className="pseudo">
                          {fullName(row.r)}
                          <small>{[row.r.pseudo, row.r.formation].filter(Boolean).join(" · ")}</small>
                        </span>
                        <span className="score">{row.polls.length}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted">Aucune donnée.</p>
                )}
              </>
            )}
          </div>
          <div className="card">
            {data && (
              <>
                <h2>Par formation</h2>
                {groups.length ? (
                  <div className="bars">
                    {groups.map((g) => (
                      <div key={g.key} className="bar">
                        <div className="bar-label">
                          <span>{g.label}</span>
                          <span className="bar-num">{g.n}</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill c0" style={{ width: `${Math.round((g.n / max) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Aucune donnée.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
