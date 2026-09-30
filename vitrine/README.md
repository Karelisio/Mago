# Vitrine GitHub

Une page unique qui présente tous les dépôts publics d'un compte GitHub : description, langages, topics, étoiles, dernier commit, **dernière release avec ses téléchargements** (APK, zip…), **changelog Markdown** avec l'historique des versions, et une **timeline des 10 dernières releases** tous projets confondus.

Aucun backend : un script récupère les données via l'API REST GitHub et produit `public/data.json`. GitHub Actions le relance toutes les 6 heures et à chaque push, puis publie le site sur GitHub Pages.

**Stack** : Vite 8, React 19, TypeScript, Tailwind CSS 4, Framer Motion, react-markdown (GFM, références `#123` / `@mention` résolues comme sur GitHub, HTML assaini), `@material/material-color-utilities` (palette Material You).

## Fonctionnalités

- **En-tête** : avatar dans une forme « cookie » Material 3 Expressive, nom, bio, lien, abonnés ; statistiques globales (dépôts, étoiles, dernière release publiée).
- **Dernières releases** : rail horizontal (défilement tactile ou flèches), un clic ouvre le changelog directement sur la bonne version.
- **Cartes projet** : couleur d'accent dérivée du langage principal (palette M3 complète par langage), répartition des langages, topics, dernier commit, dernière release avec boutons de téléchargement directs, liens Code / Issues / Releases / Site.
- **Changelog** : panneau latéral (ordinateur) ou feuille du bas (mobile, fermeture en glissant vers le bas), notes de version rendues, historique repliable, archives des sources. Échap, clic hors du panneau et le bouton Retour (y compris le geste Android) le referment.
- **Recherche et filtres** : texte (nom, description, topics, langage, accents ignorés, raccourci `/`), langages (multi-sélection), avec/sans release, tri par date, étoiles ou nom. L'état est dans l'URL : une vue filtrée ou un changelog ouvert se partage par simple lien.
- **Thème** : sombre par défaut, bascule clair/sombre avec transition circulaire, sélecteur de couleur source (préréglages, couleur libre, ou couleur extraite de l'avatar), choix mémorisés.
- **Animations** : apparition en cascade au scroll, survol avec élévation et léger tilt 3D (souris uniquement), formes qui se morphent, fond en dégradé animé. Tout est coupé ou réduit si le système demande `prefers-reduced-motion`.
- **Responsive** mobile d'abord, navigation clavier, contrastes garantis par les rôles de couleur M3.

## Structure

```
vitrine/
├── config.json              réglages (voir ci-dessous)
├── index.html               + injection du titre, des polices et de la palette par défaut (vite.config.ts)
├── public/
│   ├── data.json            données générées (écrasées à chaque build CI)
│   └── favicon.svg
├── scripts/
│   ├── fetch-data.mjs       API REST GitHub → public/data.json
│   ├── transform.mjs        transformations pures (testées)
│   └── fix-color-utils.mjs  correctif postinstall (voir « Notes techniques »)
└── src/
    ├── App.tsx              assemblage de la page
    ├── components/          en-tête, timeline, barre de filtres, cartes, changelog, Markdown…
    ├── hooks/               données, état dans l'URL, media queries
    ├── lib/                 palette M3, formes, langages, filtres/tri, formats, URL (+ tests)
    └── theme/               thème clair/sombre et couleur source
```

Le workflow est à la racine du dépôt : [`.github/workflows/vitrine-pages.yml`](../.github/workflows/vitrine-pages.yml).

## En local

Node 22.12 ou plus récent.

```bash
cd vitrine
npm install
npm run dev            # http://localhost:5173
```

Le `public/data.json` fourni est un **jeu de démonstration** (projets fictifs, signalés par un bandeau). Pour afficher tes vrais dépôts :

```bash
GITHUB_TOKEN=ghp_xxx npm run fetch-data
```

Le jeton est facultatif : sans lui, l'API accepte 60 requêtes par heure. Il en faut environ 2 plus 4 par dépôt, ce qui suffit pour une douzaine de dépôts. Un jeton sans aucune permission (fine-grained, « Public repositories (read-only) ») convient ; le script ne lit que des données publiques.

Options du script : `--repos a,b` (seulement ces dépôts, sans lister le compte) et `--out chemin`.

Autres commandes : `npm test` (Vitest), `npm run typecheck`, `npm run build` (dans `dist/`), `npm run preview`.

## Configuration (`config.json`)

| Clé | Défaut | Rôle |
| --- | --- | --- |
| `username` | — | Compte GitHub à présenter |
| `excludeForks` | `true` | Ignorer les forks |
| `excludeArchived` | `true` | Ignorer les dépôts archivés |
| `excludeRepos` | `[]` | Noms de dépôts à masquer (`"Mago"` ou `"Karelisio/Mago"`) |
| `maxReleasesPerRepo` | `15` | Releases conservées par dépôt dans l'historique (1–100) |
| `timelineSize` | `10` | Nombre de releases dans la timeline |
| `accentColor` | `#7C5CFF` | Couleur source de la palette Material You |
| `paletteStyle` | `vibrant` | Variante M3 : `vibrant`, `tonalSpot`, `expressive` ou `neutral` |
| `defaultTheme` | `dark` | Thème au premier affichage (`dark` / `light`) |
| `locale` | `fr-FR` | Format des dates et des nombres |
| `title`, `description` | — | Titre de l'onglet et description (SEO) |

Les dépôts privés ne sont jamais inclus : le script utilise `/users/{username}/repos`, qui ne liste que les dépôts publics, quel que soit le jeton.

## Activer GitHub Pages

1. **Paramètres du dépôt → Pages → Build and deployment → Source : « GitHub Actions ».**
2. Fusionner sur `main` : le déclencheur planifié (`cron`) ne fonctionne que depuis la branche par défaut.
3. Le premier déploiement part au push sur `main`. Pour le relancer à la main : **Actions → Vitrine (GitHub Pages) → Run workflow**.
4. Le site est publié sur `https://<utilisateur>.github.io/<dépôt>/`, ici **https://karelisio.github.io/Mago/**. L'URL exacte s'affiche dans le job `deploy` et dans Settings → Pages.

Aucun secret à créer : le workflow utilise le `GITHUB_TOKEN` fourni par Actions (1 000 requêtes/heure, largement suffisant). Le site utilise des chemins relatifs, il fonctionne donc aussi bien à la racine d'un domaine que dans un sous-dossier.

À savoir :

- GitHub **désactive les workflows planifiés** d'un dépôt public après 60 jours sans activité. Il suffit alors de le réactiver dans l'onglet Actions, ou de pousser un commit.
- L'environnement `github-pages` n'autorise par défaut que la branche par défaut à déployer. Un lancement manuel depuis une autre branche construit le site mais échoue au déploiement, c'est voulu.
- Pour une adresse à la racine (`https://karelisio.github.io/`), crée un dépôt nommé `Karelisio.github.io`, copies-y le contenu de `vitrine/` à la racine avec le workflow, puis retire `working-directory: vitrine`, `cache-dependency-path` et le préfixe `vitrine/` du chemin de l'artefact.

## Format de `data.json`

Défini par `src/types.ts` (`VitrineData`) et produit par `scripts/transform.mjs` : `{ generatedAt, source, profile, repos[] }`. Chaque dépôt porte ses métadonnées (langages en octets, topics, étoiles, issues ouvertes hors PR, dernier commit de la branche par défaut…), le nombre total de releases et les `maxReleasesPerRepo` plus récentes (brouillons exclus), avec leurs notes Markdown, un résumé texte et leurs assets.

## Notes techniques

- **Palette** : `src/lib/theme.ts` génère les rôles de couleur M3 (spec 2025, « Material 3 Expressive ») depuis une couleur source. La palette par défaut est injectée dans `index.html` au build, ce qui évite un flash de couleur. Chaque langage présent reçoit sa propre palette claire et sombre, appliquée par `data-accent` : changer de thème ne provoque aucun re-rendu React.
- **Correctif postinstall** : `@material/material-color-utilities` 0.4.0, seule version à embarquer le spec 2025, publie des imports relatifs sans extension que Node refuse (les bundlers, eux, les acceptent). `scripts/fix-color-utils.mjs` ajoute les `.js` manquants après `npm install`. Il est idempotent et deviendra inutile une fois le paquet corrigé.
- **Polices** : Roboto Flex (graisse et largeur variables) et Material Symbols Rounded, limité aux seules icônes utilisées (`icon_names`, liste dans `src/lib/icons.ts`).
- **Markdown** chargé à la demande : son code n'est téléchargé qu'à l'ouverture d'un changelog.
