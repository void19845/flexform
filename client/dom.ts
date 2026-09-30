import type { PollOption, PollResults } from "../shared/types.js";

type Child = Node | string | null | undefined | false;
type Props = Record<string, string | boolean | undefined>;

/** Crée un élément. Le texte passe toujours par des nœuds texte (pas d'injection HTML). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

export function button(label: string, onClick: () => void, className = ""): HTMLButtonElement {
  const btn = h("button", { type: "button", class: `btn ${className}`.trim() }, label);
  btn.addEventListener("click", onClick);
  return btn;
}

/** Barres de résultats d'un sondage à choix. */
export function bars(options: PollOption[], results: PollResults, mine?: string | null): HTMLElement {
  return h(
    "div",
    { class: "bars" },
    ...options.map((o, i) => {
      const n = results.counts[o.id] ?? 0;
      const pct = results.total ? Math.round((n / results.total) * 100) : 0;
      const fill = h("div", { class: `bar-fill c${i % 4}` });
      fill.style.width = `${pct}%`;
      return h(
        "div",
        { class: o.id === mine ? "bar mine" : "bar" },
        h("div", { class: "bar-label" }, h("span", {}, o.label), h("span", { class: "bar-num" }, `${pct} % · ${n}`)),
        h("div", { class: "bar-track" }, fill),
      );
    }),
  );
}

/** Réponses libres, anonymes. */
export function answers(list: string[]): HTMLElement {
  if (!list.length) return h("p", { class: "muted" }, "Pas encore de réponse.");
  return h("ul", { class: "answers" }, ...list.map((a) => h("li", {}, a)));
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Erreur ${res.status}`);
  return data;
}

export interface PollerHandlers<T> {
  /** startedAt : heure de départ de la requête, pour ignorer une réponse plus ancienne qu'une action locale */
  onState: (state: T, startedAt: number) => void;
  onStatus?: (connected: boolean) => void;
  /** Session ou mot de passe refusé : le poller s'arrête. */
  onUnauthorized?: () => void;
}

export interface Poller {
  /** Rafraîchit tout de suite (après une action). */
  refresh(): void;
  stop(): void;
}

/**
 * Interroge le serveur à intervalle régulier (les fonctions Vercel ne gardent pas de connexion ouverte).
 * Ralentit quand l'onglet est en arrière-plan.
 */
export function startPolling<T>(fetchState: () => Promise<T>, intervalMs: number, handlers: PollerHandlers<T>): Poller {
  let timer: number | undefined;
  let stopped = false;
  let inFlight = false;

  const schedule = (delay: number): void => {
    clearTimeout(timer);
    if (!stopped) timer = window.setTimeout(tick, delay);
  };

  async function tick(): Promise<void> {
    if (stopped || inFlight) return;
    inFlight = true;
    const startedAt = Date.now();
    try {
      const state = await fetchState();
      if (stopped) return;
      handlers.onStatus?.(true);
      handlers.onState(state, startedAt);
    } catch (err) {
      if (stopped) return;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        stopped = true;
        handlers.onUnauthorized?.();
        return;
      }
      handlers.onStatus?.(false);
    } finally {
      inFlight = false;
    }
    schedule(document.hidden ? intervalMs * 5 : intervalMs);
  }

  const onVisible = (): void => {
    if (!document.hidden) schedule(0);
  };
  document.addEventListener("visibilitychange", onVisible);
  schedule(0);

  return {
    refresh: () => schedule(0),
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    },
  };
}
