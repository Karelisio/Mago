# Mago

Application de listes partagées (courses, DIY, cadeaux…) pour un couple, avec synchronisation temps réel, mode hors-ligne, et un widget Android qui se met à jour tout seul quand l'un·e des deux modifie une liste — même app fermée.

## Stack

- **App** : React + TypeScript + Vite, empaquetée en app Android native via [Capacitor](https://capacitorjs.com/).
- **Backend** : [Supabase](https://supabase.com/) (Postgres + RLS, Auth par lien magique, Realtime, Edge Functions).
- **Push** : Firebase Cloud Messaging (FCM), pour réveiller le widget écran d'accueil app fermée.
- **CI/CD** : GitHub Actions — build + signature de l'APK à chaque push sur `main`, publié comme GitHub Release.

## Fonctionnalités

- Listes partagées avec un·e partenaire (jumelage automatique : toute nouvelle liste créée par l'un·e est partagée avec l'autre), ou invitation ponctuelle sur une liste précise.
- Catégories de listes et d'articles gérées à la volée (Réglages), pas de valeurs figées.
- Mode hors-ligne : les modifications faites sans réseau sont mises en attente et synchronisées automatiquement au retour de la connexion.
- Couleurs Material You dynamiques (Android 12+), dérivées du fond d'écran.
- Widget écran d'accueil affichant la liste la plus ancienne, avec cases à cocher fonctionnelles (cocher depuis le widget fonctionne même app fermée, voir `CLAUDE.md`).
- Mise à jour de l'app directement depuis l'app (téléchargement + installation de l'APK, sans passer par un store).

## Démarrage

```bash
npm install
cp .env.example .env   # à créer avec VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev            # app web (utile pour itérer sur l'UI, le natif ne s'y active pas)
```

### Variables d'environnement

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé publique (anon) du projet Supabase |
| `VITE_APP_VERSION` | Injectée par la CI (tag de la release), sert à détecter les mises à jour |

### Build Android local

```bash
npm run build
npx cap add android        # régénère android/ (gitignored) à partir du template Capacitor
node scripts/copy-android-templates.mjs   # réapplique tout le natif custom — voir CLAUDE.md
node scripts/patch-android-deeplink.mjs
node scripts/patch-android-manifest-extra.mjs
node scripts/patch-android-widget-manifest.mjs
node scripts/patch-android-signing.mjs     # nécessite android/keystore.properties en local
```

Sans SDK Android dans l'environnement de dev, seule la structure des fichiers générés peut être vérifiée localement (voir `CLAUDE.md`) — la compilation réelle se fait en CI.

### Secrets nécessaires (GitHub Actions)

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (signature APK)
- `GOOGLE_SERVICES_JSON` (base64 du fichier Firebase, pour FCM)

### Secrets nécessaires (Supabase Edge Function `notify-item-change`)

- `WEBHOOK_SHARED_SECRET` (aussi stocké dans Vault Postgres, lu par le trigger `notify_item_change`)
- `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` (compte de service Firebase)

## Structure du projet

```
src/                    app React (pages, hooks, contexts)
android-templates/      fichiers natifs Android custom (plugins Capacitor, widget, service FCM)
scripts/                scripts Node réappliqués après chaque régénération de android/
supabase/migrations/    schéma + RLS, une migration par évolution
supabase/functions/     Edge Functions (notify-item-change : trigger → push FCM)
```

Voir `CLAUDE.md` pour les détails d'architecture et les pièges déjà rencontrés.
