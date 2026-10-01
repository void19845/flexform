# Flexform

Application de sondages du BDE Montreuil (« Sondages AG · BDE Montreuil » côté participants), en
Next.js 16 (App Router, React 19, TypeScript), hébergeable sur Vercel, avec les données dans Supabase.
Fait partie de **Flex Suite** avec
le portfolio [Flexfolio](https://github.com/void19845/flexfolio) : même projet Supabase, et apparence
qui peut reprendre la palette et les polices de Flexfolio.

- `/` : les participants entrent prénom, nom, formation et pseudo, et donnent leur consentement RGPD
  (politique obligatoire, communication et sponsors facultatifs). Le sondage lancé en direct apparaît
  en haut de la page ; en dessous, le **hub** liste les sondages ouverts sans limite de temps, puis le
  **classement** des votants (pseudos uniquement) et les **succès** (voir `src/lib/shared/achievements.ts`).
  Les récompenses gagnées s'affichent dans **Mes récompenses**, chacune avec un QR code à usage unique.
  **Mes données** permet de voir, télécharger ou supprimer ses données et de changer ses consentements.
- `/admin` (compte admin) : lancer, clôturer et afficher les résultats des sondages. Chaque sondage peut
  être mis dans le hub, rangé dans une catégorie et doté d'une récompense (ex. « 1 café offert »).
  L'onglet **Répondants & export** liste qui a répondu, avec filtres par jour, catégorie, sondage et
  consentement, recherche, classement, répartition par formation et exports CSV (pour Excel).
  L'onglet **Apparence** lie le site à la palette et aux polices de Flexfolio, ou l'en délie.
- `/staff` (compte staff ou admin) : scanner le QR code d'une récompense, voir à qui elle appartient
  et valider la remise. Un code ne sert qu'une fois.
- `/confidentialite` : politique de confidentialité (les passages entre crochets sont à compléter).

## Données et sécurité

Tables `sondage_*` dans le schéma public du projet Supabase partagé de Flex Suite. Le SQL (tables, règles,
migrations) est dans le dépôt **flexstaff**, dossier `supabase/migrations/`. La sécurité par ligne (RLS)
est activée sur toutes :

| Qui | Accès |
|---|---|
| Visiteur (clé anon) | Rien |
| Votant | Jamais d'accès direct : le serveur agit pour lui (clé service_role) après avoir vérifié sa session |
| Compte **staff** | Lit les codes de récompense, les sondages et le nom des personnes qui ont une récompense ; peut seulement marquer un code comme remis |
| Compte **admin** | Tout sur les tables `sondage_*`, et gère l'équipe Flexform |

Les rôles viennent de la table commune `app_roles` (appli `flexform`) ; un super admin de la suite est
admin partout. Voir le README de flexstaff.

Les requêtes admin et staff arrivent à la base avec le jeton du compte connecté : c'est Postgres qui
applique ces règles, pas seulement l'appli. Les jetons restent dans des cookies HttpOnly.

Côté navigateur, `src/proxy.ts` pose une Content-Security-Policy avec un nonce différent à chaque
requête : seuls les scripts de l'appli s'exécutent (pas de script inline ni de CDN). Les styles inline
restent autorisés, car React écrit des attributs `style` au rendu serveur ; les polices peuvent venir de
Google Fonts pour l'apparence Flexfolio. Les autres en-têtes (nosniff, noindex, caméra) sont dans
`next.config.ts`.

## Mise en place

1. Base : appliquer les migrations du dépôt **flexstaff** (voir son README), qui créent aussi les rôles.
2. Dans Vercel, importer le dépôt avec le preset **Next.js** (détecté automatiquement), Node.js 22.x,
   puis **Settings → Environment Variables** :

   | Variable | Valeur |
   |---|---|
   | `SUPABASE_URL` | URL du projet (la même que `NEXT_PUBLIC_SUPABASE_URL` de Flexfolio) |
   | `SUPABASE_ANON_KEY` | Clé anon (la même que `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role (Supabase → Project Settings → API). Secrète : jamais côté navigateur |

3. Comptes de l'équipe : depuis flexstaff, `npm run role -- prenom.nom@exemple.fr flexform staff`
   (`admin` pour un admin, `remove` pour retirer l'accès).
4. Redéployer.

## Tester en local

La base locale est celle de Flex Suite (Docker Desktop requis) : `npm run db:start` dans
flexstaff, copier `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` de son `.env` dans
le `.env` de Flexform, et créer des comptes avec `npm run role` (voir le README de flexstaff). Puis :

```bash
npm install
npm run dev
```

Ouvre http://localhost:8787 (serveur de développement Next.js, qui lit `.env`).
`npm run build` puis `npm start` lancent la version de production sur le même port.

Vérifications avant un commit :

```bash
npm run lint
npm run build
node --env-file=.env scripts/e2e.mjs http://localhost:8787
```

`scripts/e2e.mjs` teste les parcours et la RLS contre la base locale (il refuse de tourner sur une
autre base).

## Structure

| Dossier | Contenu |
|---|---|
| `src/app/` | Pages (`/`, `/admin`, `/staff`, `/confidentialite`), mise en page et `globals.css` |
| `src/app/api/` | Route Handlers, un dossier par route (`/api/state`, `/api/vote`, `/api/admin/...`, `/api/auth/...`) |
| `src/components/` | Composants React des pages (`vote/`, `admin/`, `staff/`) et composants partagés |
| `src/lib/server/` | Logique serveur (jamais importée côté navigateur) : accès Supabase, sessions, sondages, apparence |
| `src/lib/client/` | Outils des pages : appels API, interrogation régulière, mise en forme, téléchargements |
| `src/lib/shared/` | Types et succès communs au serveur et aux pages |
| `src/proxy.ts` | Content-Security-Policy avec nonce |
| `scripts/` | Test de bout en bout |

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Projet Supabase (les noms `NEXT_PUBLIC_*` de Flexfolio marchent aussi) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur, pour les actions des votants et la gestion de l'équipe |
| `FLEXFOLIO_SUPABASE_URL`, `FLEXFOLIO_SUPABASE_ANON_KEY` | Facultatif : lire l'apparence dans un autre projet que celui des sondages |
