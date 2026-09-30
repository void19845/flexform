import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Confidentialité · Sondages BDE Montreuil",
};

export default function PrivacyPage() {
  return (
    <main className="page-doc">
      <article className="card doc">
        <p className="eyebrow">BDE Montreuil</p>
        <h1>Politique de confidentialité</h1>
        <p className="muted">
          Version 1 · Les passages entre crochets sont à compléter par le bureau du BDE avant la mise en ligne.
        </p>

        <h2>Qui est responsable de tes données ?</h2>
        <p>
          Le Bureau des Étudiants de Montreuil ([nom exact de l&apos;association], [adresse]). Contact pour toute
          question sur tes données : <strong>[adresse e-mail du BDE]</strong>.
        </p>

        <h2>Quelles données ?</h2>
        <ul>
          <li>Ton prénom, ton nom, ta formation et ton pseudo, saisis à la création du compte.</li>
          <li>Tes réponses aux sondages et l&apos;heure de chaque réponse.</li>
          <li>Tes récompenses (gagnées, remises) et tes succès.</li>
          <li>Tes choix de consentement et leur date.</li>
        </ul>
        <p>
          Aucune autre donnée n&apos;est collectée : pas d&apos;adresse e-mail, pas de publicité, pas de traceur. Un
          cookie technique garde ta session ouverte ; ton navigateur retient aussi les succès déjà annoncés.
        </p>

        <h2>Pour quoi faire ?</h2>
        <table>
          <thead>
            <tr>
              <th>Utilisation</th>
              <th>Base légale</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Organiser les sondages de l&apos;AG et du BDE, compter les votes, remettre les récompenses, afficher le
                classement (pseudo uniquement).
              </td>
              <td>Intérêt légitime de l&apos;association à consulter ses membres. Nécessaire pour participer.</td>
            </tr>
            <tr>
              <td>
                Utiliser tes réponses, ton nom et ta formation pour la communication et les actions marketing du BDE.
              </td>
              <td>Ton consentement (case facultative).</td>
            </tr>
            <tr>
              <td>Transmettre tes réponses, ton nom et ta formation aux partenaires et sponsors du BDE.</td>
              <td>Ton consentement (case facultative).</td>
            </tr>
          </tbody>
        </table>
        <p>
          Refuser les cases facultatives ne change rien à ta participation aux votes ni aux récompenses. Des
          statistiques anonymes (par exemple « 60 % des répondants sont en BUT Info ») peuvent être montrées aux
          partenaires sans ton consentement, car elles ne permettent pas de t&apos;identifier.
        </p>

        <h2>Qui y a accès ?</h2>
        <p>
          Les membres du bureau du BDE (page d&apos;administration) et, pour la remise des récompenses, les membres du
          staff (ils voient ton nom, ta formation et la récompense). Les partenaires et sponsors uniquement si tu as
          donné ton accord. Les autres participants ne voient que ton pseudo dans le classement.
        </p>
        <p>
          Les données sont hébergées par Vercel (application) et Supabase (base de données, [région du projet
          Supabase, par exemple Union européenne]).
        </p>

        <h2>Combien de temps ?</h2>
        <p>
          Jusqu&apos;au [31 août suivant la fin de l&apos;année universitaire], puis elles sont supprimées. Tu peux
          les supprimer toi-même avant.
        </p>

        <h2>Tes droits</h2>
        <p>
          Tu peux à tout moment, depuis le bouton <strong>Mes données</strong> en bas de la page des sondages :
        </p>
        <ul>
          <li>voir et télécharger tes données (droits d&apos;accès et de portabilité) ;</li>
          <li>retirer ou donner ton accord pour la communication et les sponsors ;</li>
          <li>supprimer ton compte, tes réponses et tes récompenses (droit à l&apos;effacement).</li>
        </ul>
        <p>
          Pour corriger une donnée ou toute autre demande, écris à <strong>[adresse e-mail du BDE]</strong>. Si tu
          estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL (cnil.fr).
        </p>

        <p>
          {/* Lien simple comme dans l'ancienne version : la page des sondages est rechargée entièrement */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="btn ghost" href="/">
            Retour aux sondages
          </a>
        </p>
      </article>
    </main>
  );
}
