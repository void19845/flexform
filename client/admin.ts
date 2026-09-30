import { MAX_CATEGORY_LENGTH, MAX_REWARD_LENGTH, type AdminState, type PollStatus, type RespondentsState, type ThemeState } from "../shared/types.js";
import { answers, api, bars, button, h, plural, startPolling } from "./dom.js";
import { currentAccount, loginForm, signOut as endSession, type Account } from "./account.js";
import { appearanceView } from "./appearance.js";
import { respondentsView } from "./respondents.js";

const app = document.getElementById("app")!;
const STATUS: Record<PollStatus, string> = { draft: "Pas lancé", open: "En cours", closed: "Clôturé" };

/** Les jetons du compte sont dans des cookies HttpOnly : les requêtes n'ont rien à ajouter. */
function adminApi(path: string, method = "POST", body?: unknown): Promise<unknown> {
  return api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function boot(): Promise<void> {
  const account = await currentAccount().catch(() => null);
  if (account?.role === "admin") showPanel(account);
  else showLogin(account ? STAFF_ONLY : "");
}

// --- Connexion admin ------------------------------------------------------

const STAFF_ONLY = "Ce compte a le rôle staff : il donne accès à la page staff, pas à l'administration.";

function showLogin(message = ""): void {
  const form = loginForm({
    eyebrow: "AG · BDE Montreuil",
    title: "Administration",
    message,
    onSignedIn: (account) => {
      if (account.role === "admin") showPanel(account);
      else showLogin(STAFF_ONLY);
    },
  });
  app.replaceChildren(h("div", { class: "narrow" }, form));
}

// --- Tableau de bord ------------------------------------------------------

function showPanel(account: Account): void {
  const toast = h("p", { class: "toast", role: "status", hidden: true });
  let toastTimer: number | undefined;
  const flash = (msg: string): void => {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), 3500);
  };
  // Après chaque action, on rafraîchit tout de suite au lieu d'attendre le prochain tour
  const run = (fn: () => Promise<unknown>) => (): void => {
    fn()
      .then(() => poller.refresh())
      .catch((err: unknown) => flash((err as Error).message));
  };

  const status = h("p", { class: "status", hidden: true }, "Connexion perdue, reconnexion…");
  const liveEl = h("div", { class: "card live-bar" });
  const pollsEl = h("div", { class: "polls" });
  const joinEl = h("div", { class: "card join" });
  const peopleEl = h("div", { class: "card people" });

  const signOut = (message = ""): void => {
    poller.stop();
    respondents.hide();
    void endSession().then(() => showLogin(message));
  };
  const logout = button("Déconnexion", () => signOut(), "ghost small");

  const respondents = respondentsView(
    () => api<RespondentsState>("/api/admin/respondents"),
    () => signOut("Session expirée, reconnecte-toi."),
  );
  respondents.el.hidden = true;
  const creator = createForm(run, flash);
  const pollsTab = h("div", {}, liveEl, h("div", { class: "layout" }, h("main", {}, pollsEl, creator.form), h("aside", {}, joinEl, peopleEl)));

  const appearance = appearanceView((method, body) =>
    api<ThemeState>("/api/admin/theme", { method, body: body === undefined ? undefined : JSON.stringify(body) }),
  );

  // Onglets : le pilotage continue de se rafraîchir en arrière-plan, les répondants seulement quand ils sont affichés
  const showTab = (name: "polls" | "respondents" | "appearance"): void => {
    pollsTab.hidden = name !== "polls";
    if (name === "respondents") respondents.show();
    else respondents.hide();
    if (name === "appearance") appearance.show();
    else appearance.hide();
  };
  const tabs = [
    { label: "Sondages", show: () => showTab("polls") },
    { label: "Répondants & export", show: () => showTab("respondents") },
    { label: "Apparence", show: () => showTab("appearance") },
  ];
  const tabButtons = tabs.map((t, i) =>
    button(t.label, () => {
      tabButtons.forEach((b, j) => b.setAttribute("aria-selected", String(i === j)));
      t.show();
    }, "tab"),
  );
  tabButtons.forEach((b, i) => {
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(i === 0));
  });

  app.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      h("div", {}, h("p", { class: "eyebrow" }, "AG · BDE Montreuil"), h("h1", {}, "Pilotage des sondages")),
      h(
        "div",
        { class: "topbar-actions" },
        h("span", { class: "muted small" }, account.email),
        h("a", { class: "btn ghost small", href: "/staff", target: "_blank", rel: "noopener" }, "Page staff"),
        logout,
      ),
    ),
    h("nav", { class: "tabs", role: "tablist" }, ...tabButtons),
    status,
    pollsTab,
    respondents.el,
    appearance.el,
    toast,
  );

  const act = (id: string, action: string) => run(() => adminApi("/api/admin/action", "POST", { id, action }));

  function renderLive(s: AdminState): void {
    const poll = s.polls.find((p) => p.id === s.activePollId);
    liveEl.replaceChildren(
      poll
        ? h(
            "div",
            {},
            poll.status === "open"
              ? h("p", { class: "eyebrow live" }, "Vote en cours chez les votants")
              : h("p", { class: "eyebrow" }, "Affiché chez les votants · vote clôturé"),
            h("strong", {}, poll.question),
          )
        : h("div", {}, h("p", { class: "eyebrow" }, "Rien d'affiché"), h("span", { class: "muted" }, "Les votants voient l'écran d'attente.")),
      poll ? button("Écran d'attente", run(() => adminApi("/api/admin/clear")), "ghost") : "",
    );
  }

  function renderPolls(s: AdminState): void {
    pollsEl.replaceChildren(
      ...s.polls.map((p, i) => {
        const active = s.activePollId === p.id;
        const live = active && p.status === "open";
        return h(
          "article",
          { class: active ? "card poll-admin active" : "card poll-admin" },
          h(
            "div",
            { class: "poll-meta" },
            h("span", { class: "num" }, String(i + 1)),
            h("span", { class: `badge ${p.status}` }, STATUS[p.status]),
            active && h("span", { class: "badge live" }, "Affiché"),
            p.hub && h("span", { class: "badge hub" }, "Dans le hub"),
            p.reveal && h("span", { class: "badge" }, "Résultats visibles"),
            h("span", { class: "badge" }, p.kind === "text" ? "Réponse libre" : "Choix"),
            p.category && h("span", { class: "badge category" }, p.category),
            p.reward && h("span", { class: "badge reward", title: "Récompenses remises / gagnées" }, `Récompense : ${p.reward} · ${p.rewards.redeemed}/${p.rewards.issued} remises`),
            h("span", { class: "count" }, plural(p.results.total, "réponse")),
          ),
          h("h3", {}, p.question),
          p.kind === "choice" ? bars(p.options, p.results) : answers(p.results.answers),
          h(
            "div",
            { class: "actions" },
            !live && button(p.status === "draft" ? "Lancer" : "Relancer", act(p.id, "open"), "primary"),
            p.status === "open" && button("Clôturer", act(p.id, "close"), "warn"),
            button(p.hub ? "Retirer du hub" : "Mettre dans le hub", act(p.id, p.hub ? "unhub" : "hub")),
            button(p.reveal ? "Masquer les résultats" : "Montrer les résultats", act(p.id, p.reveal ? "hide" : "reveal")),
            button("Catégorie", run(async () => {
              const category = prompt("Catégorie de ce sondage (vide pour la retirer) :", p.category ?? "");
              if (category !== null) await adminApi("/api/admin/category", "POST", { id: p.id, category });
            }), "ghost"),
            button("Récompense", run(async () => {
              const reward = prompt(
                "Récompense gagnée en répondant (ex. : 1 café offert). Vide pour la retirer : les QR codes pas encore utilisés seront annulés.",
                p.reward ?? "",
              );
              if (reward !== null) await adminApi("/api/admin/reward", "POST", { id: p.id, reward });
            }), "ghost"),
            button("Remettre à zéro", run(async () => {
              if (confirm("Effacer toutes les réponses de ce sondage ?")) await adminApi("/api/admin/action", "POST", { id: p.id, action: "reset" });
            }), "ghost"),
            button("Supprimer", run(async () => {
              if (confirm(`Supprimer « ${p.question} » ?`)) await adminApi("/api/admin/action", "POST", { id: p.id, action: "delete" });
            }), "ghost danger"),
          ),
        );
      }),
    );
  }

  function renderPeople(s: AdminState): void {
    const voted = s.participants.filter((p) => p.voted).length;
    peopleEl.replaceChildren(
      h("h2", {}, `Participants · ${s.participants.length}`),
      s.activePollId ? h("p", { class: "muted" }, `${voted} / ${s.participants.length} ont répondu au sondage affiché`) : "",
      s.participants.length
        ? h(
            "ul",
            { class: "people-list" },
            ...s.participants.map((p) => {
              const kick = button("×", run(async () => {
                if (confirm(`Déconnecter ${p.pseudo} et libérer son pseudo ?`)) await adminApi("/api/admin/kick", "POST", { id: p.id });
              }), "icon");
              kick.title = "Déconnecter";
              return h(
                "li",
                {},
                h(
                  "span",
                  { class: "pseudo" },
                  p.pseudo,
                  (p.prenom || p.nom) && h("small", {}, [p.prenom, p.nom].filter(Boolean).join(" ") + (p.formation ? ` · ${p.formation}` : "")),
                ),
                p.voted && h("span", { class: "voted" }, "a répondu"),
                kick,
              );
            }),
          )
        : h("p", { class: "muted" }, "Personne pour l'instant."),
    );
  }

  /** Le QR encode l'adresse du site telle qu'affichée : les deux viennent de location.origin. */
  function renderJoin(): void {
    const url = location.origin;
    joinEl.replaceChildren(
      h("h2", {}, "Rejoindre"),
      h("img", { src: `/api/qr?url=${encodeURIComponent(url)}`, alt: "QR code pour rejoindre", width: "220", height: "220" }),
      h("p", { class: "join-url" }, url.replace(/^https?:\/\//, "")),
    );
  }
  renderJoin();

  const poller = startPolling(() => api<AdminState>("/api/admin/state"), 2000, {
    onState: (s) => {
      renderLive(s);
      renderPolls(s);
      renderPeople(s);
      creator.setCategories([...new Set(s.polls.map((p) => p.category).filter((c): c is string => Boolean(c)))]);
    },
    onStatus: (connected) => {
      status.hidden = connected;
    },
    onUnauthorized: () => signOut("Session expirée ou accès retiré, reconnecte-toi."),
  });
}

/** Formulaire de création. setCategories met à jour les suggestions du champ Catégorie. */
function createForm(
  run: (fn: () => Promise<unknown>) => () => void,
  flash: (msg: string) => void,
): { form: HTMLFormElement; setCategories: (list: string[]) => void } {
  const category = h("input", { type: "text", maxlength: String(MAX_CATEGORY_LENGTH), placeholder: "Ex. : Votes AG", list: "categories" });
  const categories = h("datalist", { id: "categories" });
  const hub = h("input", { type: "checkbox" });
  const reward = h("input", { type: "text", maxlength: String(MAX_REWARD_LENGTH), placeholder: "Ex. : 1 café offert" });
  const question = h("input", { type: "text", maxlength: "200", placeholder: "Ta question", required: true });
  const kind = h(
    "select",
    {},
    h("option", { value: "choice" }, "Choix multiples"),
    h("option", { value: "text" }, "Réponse libre"),
  );
  const options = h("textarea", { rows: "4", placeholder: "Pour\nContre\nAbstention" });
  const optionsField = h("label", { class: "field" }, h("span", {}, "Choix (un par ligne)"), options);
  kind.addEventListener("change", () => {
    optionsField.hidden = kind.value === "text";
  });

  const form = h(
    "form",
    { class: "card create" },
    h("h2", {}, "Nouveau sondage"),
    h("label", { class: "field" }, h("span", {}, "Question"), question),
    h("label", { class: "field" }, h("span", {}, "Type"), kind),
    optionsField,
    h("label", { class: "field" }, h("span", {}, "Catégorie (facultatif)"), category, categories),
    h("label", { class: "field" }, h("span", {}, "Récompense en répondant (facultatif, QR code à usage unique)"), reward),
    h("label", { class: "check" }, hub, h("span", {}, "Mettre dans le hub de l'accueil (ouvert sans limite de temps)")),
    h("button", { type: "submit", class: "btn primary" }, "Ajouter le sondage"),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      await adminApi("/api/admin/polls", "POST", {
        question: question.value,
        kind: kind.value,
        options: options.value.split("\n"),
        category: category.value,
        reward: reward.value,
        hub: hub.checked,
      });
      form.reset();
      optionsField.hidden = false;
      flash("Sondage ajouté");
    })();
  });
  let current = "";
  return {
    form,
    // Remplacée seulement si la liste change, pour ne pas fermer les suggestions ouvertes
    setCategories: (list) => {
      if (list.join("\n") === current) return;
      current = list.join("\n");
      categories.replaceChildren(...list.map((c) => h("option", { value: c })));
    },
  };
}

void boot();
