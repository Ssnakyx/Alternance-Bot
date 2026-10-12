# Alternance Bot

Un outil perso pour trouver une alternance plus vite. Chaque matin, il récupère les offres
d'alternance (Lyon et télétravail), les note selon ton CV grâce à l'IA et prépare le dossier de
candidature des meilleures : lettre de motivation, CV adapté au poste, email et message court. Il
suit ensuite tes candidatures jusqu'à la réponse.

**Rien n'est envoyé sans ta validation** : l'IA prépare, tu relis, puis tu cliques sur « Envoyer ».

## Ce que fait l'appli

- **Tableau de bord** : offres trouvées, candidatures envoyées, taux de réponse, entretiens et
  délai moyen de réponse. On y trouve aussi les candidatures par semaine, l'entonnoir, les sources,
  les compétences qui te manquent le plus souvent, l'activité récente et une liste « À faire ».
- **Offres** : triées par score de compatibilité (0 à 100 %) avec points forts et manques, plus
  des filtres pour le télétravail et les candidatures spontanées.
- **Fiche offre, dossier de candidature** préparé par l'IA, modifiable partie par partie :
  - **lettre de motivation** au format courrier (PDF avec ton nom, l'entreprise et la date) ;
  - **CV adapté au poste** : l'IA réordonne, reformule et met en avant ce qui correspond à l'offre,
    sans rien inventer. Elle te montre ce qu'elle a changé et ce que l'offre demande mais que ton
    CV n'a pas. Tu peux le retoucher à la main ou demander une retouche (« mets mon projet X en
    premier ») ;
  - **email d'accompagnement** et **message court** pour les formulaires en ligne ou LinkedIn.

  Tu l'envoies par email avec le CV adapté et la lettre en pièces jointes, ou tu télécharges les
  PDF pour le formulaire de candidature. On y trouve aussi une relance préparée par l'IA et
  l'historique.
- **Suivi** : tableau Lettre prête → Envoyée → Relancée → Entretien → Acceptée / Refusée.
- **Automatique, chaque matin** (Vercel Cron, 6 h UTC) :
  1. récupération des nouvelles offres (La Bonne Alternance, France Travail, Adzuna) ;
  2. notation par l'IA ;
  3. dossiers préparés pour les meilleures offres, CV adapté compris (réglable dans le profil) ;
  4. lecture de ta boîte Gmail. Quand une entreprise répond, l'IA lit l'email et passe la
     candidature en « Entretien », « Acceptée » ou « Refusée » toute seule.

## Stack

Next.js 16 (TypeScript, App Router) · Tailwind CSS · Supabase (Postgres) · API Claude ·
Gmail (envoi SMTP et lecture IMAP) · Vercel.

## Installation

### 1. Les comptes et clés

| Service | À quoi ça sert | Où créer la clé |
| --- | --- | --- |
| Supabase | Base de données | [supabase.com](https://supabase.com) > New project > Project Settings > API |
| Anthropic | IA (notes, lettres, lecture des réponses) | [console.anthropic.com](https://console.anthropic.com) > API Keys |
| La Bonne Alternance | Offres d'alternance et entreprises qui recrutent | [api.apprentissage.beta.gouv.fr](https://api.apprentissage.beta.gouv.fr) |
| France Travail | Offres en contrat d'apprentissage ou de professionnalisation | [francetravail.io](https://francetravail.io), API « Offres d'emploi v2 » |
| Adzuna | Agrégateur (Indeed, sites carrières...) | [developer.adzuna.com](https://developer.adzuna.com) |
| Gmail | Envoyer les candidatures et lire les réponses | [Mot de passe d'application](https://myaccount.google.com/apppasswords) |

Les sources d'offres sont facultatives : celles qui n'ont pas de clé sont simplement ignorées.

### 2. La base de données

Dans Supabase, ouvre **SQL Editor > New query**, colle le contenu de `supabase/schema.sql`, puis clique sur **Run**.
Le script peut être relancé sans risque après une mise à jour : il ajoute seulement ce qui manque.

### 3. Lancer en local

```bash
cp .env.example .env.local   # puis remplis les valeurs
npm install
npm run dev
```

Ouvre http://localhost:3000 et connecte-toi avec `APP_PASSWORD`. Dans **Profil**, envoie ton CV
(PDF) et règle ta recherche, puis clique sur **Chercher de nouvelles offres**.

### 4. Mettre en ligne (Vercel)

1. Importe le dépôt sur [vercel.com](https://vercel.com/new).
2. Ajoute toutes les variables de `.env.example` dans **Settings > Environment Variables**.
3. Déploie. La tâche du matin est déclarée dans `vercel.json`, et Vercel envoie `CRON_SECRET`
   tout seul pour l'authentifier.

## Coût de l'IA

L'API Claude se paie à part (crédits prépayés sur la console Claude) : l'abonnement Claude Pro
ou Max ne la couvre pas. Toute l'IA utilise **Claude Opus 5.5**. Une journée chargée (60 offres
notées, 5 dossiers avec CV adapté) coûte environ 1 à 2 $ ; les jours suivants, il y a moins de
nouvelles offres. Un dossier préparé à la main coûte environ 0,15 à 0,30 $. Pour dépenser moins,
baisse le nombre de dossiers préparés chaque matin ou décoche « Adapter aussi mon CV » dans le profil.

Pour réduire le coût, mets `CLAUDE_MODEL_FAST=claude-haiku-5-5` : le tri des offres, la lecture du
CV et celle des réponses passent alors sur Haiku (environ 40 fois moins cher), et les lettres
restent sur Opus. `CLAUDE_MODEL_WRITING` règle le modèle des lettres et relances.

## Organisation du code

```
src/
  app/                 pages (tableau de bord, offres, suivi, profil, connexion) et actions serveur
  app/api/cron/        routine du matin
  components/          composants d'interface
  lib/sources/         une API d'offres par fichier, toutes ramenées au même format
  lib/claude.ts        appels à l'IA (CV, score, dossier, CV adapté, relance, lecture des réponses)
  lib/pdf.tsx          mise en page PDF du CV adapté et de la lettre
  lib/inbox.ts         lecture des réponses dans Gmail
  lib/pipeline.ts      enchaînement de la routine
  lib/stats.ts         calcul des statistiques
supabase/schema.sql    tables
```
