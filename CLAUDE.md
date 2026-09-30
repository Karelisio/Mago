# CLAUDE.md — notes pour travailler sur Mago

Lis ça avant de toucher au natif Android ou à Supabase : plusieurs bugs réels
(pas hypothétiques) ont déjà été trouvés et corrigés ici, souvent seulement
détectables sur un vrai téléphone. Ne les refais pas.

## Environnement de dev

**Aucun SDK Android, émulateur ni téléphone réel ici.** Toute validation
locale du natif se limite à :
1. `rm -rf android && npx cap add android` (régénère le template Capacitor),
2. lancer tous les scripts `scripts/*.mjs` dans l'ordre du workflow CI,
3. vérifier que les XML générés sont bien formés (`python3 -c "import xml.dom.minidom as m; m.parse('...')"`),
4. `kotlinc <fichier>.kt -include-runtime -d /tmp/x.jar 2>&1 | grep error:` sur
   chaque `.kt` modifié — ignorer les erreurs `unresolved reference`
   (normal, pas de classpath Android/Firebase/Capacitor ici), traiter le
   reste comme un vrai bug. Ce `kotlinc` est une vieille version (1.3.31,
   via apt) qui **ne supporte pas les virgules finales** dans un appel —
   le vrai projet compile en Kotlin 1.9.24 qui les supporte, mais retire-les
   quand même pour que ce check local reste utilisable.

**La validation fonctionnelle réelle attend systématiquement un build CI +
un test sur le téléphone de l'utilisateur.** Un CI vert ne garantit rien
(voir le bug d'icône ci-dessous) — annonce toujours qu'un point natif reste
à confirmer par un test réel, et prévoit 1-2 allers-retours.

## `android/` est entièrement régénéré à chaque run CI

`android/` est gitignored et recréé par `npx cap add android` à chaque build.
**Rien de ce qui y est modifié directement ne survit.** Toute personnalisation
native vit dans `android-templates/` + `scripts/copy-android-templates.mjs`
(copie les fichiers, active Kotlin, ajoute les deps Gradle, enregistre les
plugins Capacitor) et les `scripts/patch-android-*.mjs` (patchs ciblés du
manifest/gradle générés). Voir `.github/workflows/android-release.yml` pour
l'ordre exact des étapes — il compte.

Chaque script est idempotent (déjà patché = OK) mais **échoue (code 1,
« motif attendu introuvable »)** dès qu'une ancre du template Capacitor
manque (`scripts/lib/patch-utils.mjs` : `replaceOrFail` puis
`assertIncludes` sur le résultat). Avant, un template modifié faisait
« réussir » le script sans rien changer, et l'erreur n'apparaissait qu'à
l'exécution sur le téléphone (plugin non enregistré, permission absente).
Tout nouveau patch passe par ces helpers, jamais par un `.replace()` nu.
Côté release, `fail_on_unmatched_files: true` : pas de release sans APK.

Pour ajouter un nouveau plugin Capacitor : l'ajouter au tableau `pluginFiles`
dans `copy-android-templates.mjs`, la boucle d'enregistrement dans
`MainActivity.java` s'occupe du reste. Un composant natif qui n'est PAS un
plugin Capacitor (`AppWidgetProvider`, `FirebaseMessagingService`) se copie
à part et se déclare dans le manifest via un script `patch-android-*.mjs`
dédié (un script par concern, pas un fourre-tout).

## Pièges déjà rencontrés (vérifiés en réel, pas des suppositions)

- **Qualificatif de ressource Android** : le template Capacitor stock
  embarque son propre `ic_launcher_foreground.xml` dans
  `res/drawable-v24/`, qui l'emporte sur notre `res/drawable/` non qualifié
  (qualificatif plus spécifique). CI compilait sans erreur, mais l'icône
  affichée sur le téléphone était le robot Android générique. Le script
  scanne maintenant tous les `res/drawable*/` et supprime les variantes
  stock avant de copier les nôtres. **Réflexe à avoir pour toute nouvelle
  ressource** : vérifier si le template stock a déjà un fichier du même nom
  ailleurs avec un qualificatif plus spécifique.
- **`revoke ... from anon, authenticated` ne suffit pas** : Postgres accorde
  `EXECUTE` à `PUBLIC` par défaut sur toute nouvelle fonction. Il faut
  `revoke execute on function ... from public;` explicitement, sinon
  `anon`/`authenticated` restent exécutants via `PUBLIC`. Vérifier après
  coup avec `mcp__Supabase__get_advisors` (type `security`).
- **`.upsert()` piégeux avec RLS** : un `INSERT ... ON CONFLICT DO UPDATE`
  exige que la policy RLS `UPDATE` soit satisfaite même sans conflit réel.
  Si cette policy dépend d'un état posé par un trigger qui n'a pas encore
  tourné (ex. `list_members` peuplé par un trigger `AFTER INSERT` sur
  `lists`), l'upsert échoue systématiquement. Préférer un `SELECT` de
  vérification puis un `insert()` ou `update()` explicite (voir
  `SyncContext.tsx`). `device_tokens` n'a pas ce problème (policies basées
  uniquement sur `auth.uid()`), d'où l'usage sûr de `.upsert()` dans
  `usePushRegistration.ts`.
- **Secrets** : ne jamais demander à l'utilisateur de coller un secret brut
  dans le chat s'il peut l'ajouter lui-même (GitHub Settings → Secrets,
  Supabase Dashboard → Edge Functions → Secrets). Si un fichier sensible
  est quand même envoyé dans le chat, le traiter (ex. l'encoder en base64)
  sans le reformuler plus que nécessaire.
- **`supabase.channel(topic)` réutilise le canal existant** : si deux hooks
  s'abonnent au même topic Realtime (même table/id), le second reçoit le
  même objet `RealtimeChannel` que le premier au lieu d'un nouveau — un
  second `.on(...)` dessus lève une exception ("cannot add ... callbacks
  ... after subscribe()"), fatale sans `ErrorBoundary` (app entièrement
  démontée, écran blanc — vécu en prod avec `useWidgetSync` +
  `ListDetail` s'abonnant tous deux à `items:<listId>` pour la même liste).
  `useRealtimeItems.ts` compte les références par `listId` pour n'ouvrir
  qu'un seul abonnement réel, quel que soit le nombre de composants montés
  dessus.
- **Qualificatifs de ressource combinés** : `values-v31/` (Android 12+) ne
  s'applique **qu'en thème clair** — `values-night/` (qualificatif "night"
  seul) est plus spécifique et gagne en thème sombre. Pour du contenu
  dynamique Android 12+ qui doit aussi s'appliquer en sombre, il faut un
  dossier combiné `values-night-v31/` (ordre imposé : night avant version).
  Vécu avec les couleurs du widget (`widget_colors_v31.xml`) : le dégradé
  Material dynamique ne s'affichait qu'en thème clair, jamais en sombre.
- **Ne jamais bloquer une action sur une table de catégories vidable par
  l'utilisateur** : `list_categories`/`item_categories` sont gérées par
  l'utilisateur (Réglages, suppression possible). Rendre une action (ajouter
  un article, créer une liste) `disabled` tant qu'aucune catégorie n'est
  sélectionnée revient à bloquer totalement l'app si l'utilisateur vide la
  table concernée — vécu en prod (plus moyen d'ajouter le moindre article).
  La catégorie doit rester optionnelle sur l'action elle-même (null en
  base), seul le confort de présélection en dépend.

## Widget écran d'accueil (Phase 5)

- Une seule liste : celle choisie dans Réglages (préférence par appareil,
  `useWidgetListPref.ts`), sinon **la première par `created_at`
  ascendant**, même tri que `useLists.ts`. Si ce tri change un jour, le
  widget change de liste en même temps — c'est voulu.
- Snapshot unique en JSON, stocké dans les `SharedPreferences` "mago_widget"
  sous la clé "snapshot_json", forme `{list_id, list_name, user_id, total,
  remaining, items}` : `total` = articles de la liste (cochés compris),
  `remaining` = articles non cochés (tous, pas seulement ceux affichés),
  `items` = articles **non cochés** seulement, triés comme l'app
  (`useItems.ts`), réduits à `{id, list_id, name, qty, unit, completed}`
  (noms de colonnes Postgres). Le natif ne lit ces champs qu'avec `opt*` +
  valeur par défaut (repli sur un décompte des articles affichés si
  `remaining` manque). Alimenté par deux chemins qui doivent rester au même
  format : `WidgetBridgePlugin.updateSnapshot()` (app ouverte, JS,
  `useWidgetSync.ts`) et `MagoFcmService.onMessageReceived()` (app fermée,
  push FCM data-only — l'Edge Function `notify-item-change` construit
  exactement ce JSON et l'envoie sous une seule clé `snapshot` pour éviter
  d'avoir deux formats à maintenir).
- **Charge data FCM limitée à 4 Ko** : l'Edge Function retire des articles
  en fin d'aperçu tant que `JSON.stringify({ snapshot })` dépasse 3500
  octets (≈ 14 à 19 articles selon la longueur des noms), `remaining`/`total`
  restant exacts. Avec des lignes complètes (`select('*')`), plus aucun push
  n'arrivait dès ~9 articles. Tout envoi FCM non OK est journalisé (status +
  `errorCode`, lu dans le détail `google.firebase.fcm.v1.FcmError`) ; un
  token n'est purgé que sur 404 ou `UNREGISTERED`.
- Le push concerne la liste modifiée, quelle qu'elle soit :
  `MagoFcmService` l'ignore si le snapshot déjà stocké a un autre `list_id`
  non vide (le widget reste sur sa liste). Sans snapshot stocké, le push
  est accepté tel quel — sauf après une déconnexion : `clearSnapshot()`
  pose `signed_out` dans "mago_widget", et tout push est ignoré jusqu'au
  prochain `updateSnapshot()` (qui le retire).
- Tout chemin de mise à jour du widget (`onUpdate`, `refreshAll`, coche)
  est enveloppé dans `try { … } catch (e: Throwable)` : il tourne dans le
  processus de l'app, une exception la fermerait.
- **Cocher un article depuis le widget ne fait aucun appel réseau natif.**
  Un **patch** `{id, list_id, completed, last_modified_by, updated_at}` —
  jamais la ligne entière du snapshot, qui peut être périmée (renommage
  écrasé, article retiré ressuscité) — est ajouté directement dans la queue
  de sync hors-ligne de l'app (mêmes `SharedPreferences` que
  `@capacitor/preferences`, groupe par défaut `"CapacitorStorage"`, clé
  `"mago_sync_queue_v1"`, même format que `QueueEntry` dans
  `offlineQueue.ts` : `{table, row, enqueuedAt, version, patch?}`). Si une
  entrée existe déjà pour cet article, le widget fusionne le patch dans sa
  `row` (en gardant ses autres colonnes et son drapeau `patch`), **à sa
  place dans la file**, au lieu de la remplacer. `SyncContext.flush()` la
  synchronise au prochain passage de l'app au premier plan
  (`appStateChange` relit la file) — aucun jeton
  d'accès natif à maintenir. Si cette queue change de nom/clé/format côté
  JS, `MagoWidgetProvider.kt` doit être mis à jour en même temps.
- La file est envoyée **dans l'ordre** : une nouvelle version d'une ligne
  déjà en file la remplace **sur place** (`enqueueEntry`, et la fusion du
  widget), jamais en fin de file — sinon une liste créée hors ligne puis
  renommée/déplacée passait derrière ses propres articles, dont l'insert
  échouait (FK/RLS) tant qu'elle n'existait pas côté serveur.
- Champs de `QueueEntry` à garder alignés JS ↔ Kotlin :
  - `version` : UUID neuf à **chaque** mise en file (JS
    `crypto.randomUUID()`, Kotlin `UUID.randomUUID()`). `flush()` relit
    l'entrée juste avant l'envoi (absente → annulée, on saute ; remplacée →
    on envoie la plus récente) et ne retire ensuite que la version envoyée
    (`removeEntryIfUnchanged`) : une version mise en file pendant la requête
    (cocher puis décocher vite, « Annuler » un import) n'est plus perdue.
    Repli sur `enqueuedAt` pour une ancienne entrée sans `version`.
  - `patch: true` : jamais inséré. Ligne absente côté serveur → entrée
    abandonnée (journalisée via `logSyncError`) ; sinon `update()` des
    seules colonnes du patch.
  - `attempts` (optionnel, absent = 0) : échecs **définitifs** de cette
    version — code Postgres de classe 23 (FK 23503, doublon 23505…) ou RLS
    42501, voir `isPermanentSyncError`. Au 3e (`MAX_SYNC_ATTEMPTS`),
    l'entrée est retirée et journalisée (« Abandonnée après 3 échecs »).
    Une erreur réseau, serveur ou de schéma (PGRST…) ne compte jamais, ni
    l'échec d'un article dont la liste attend encore son envoi. Remis à
    zéro à chaque nouvelle version (nouvelle entrée côté JS ; la fusion du
    widget retire le champ). `flush()` ne tourne jamais sans session (sinon
    RLS refuserait tout et ferait abandonner des écritures valides).
- Réglages > Synchronisation : nombre d'écritures en attente, « Vider la
  file » (après confirmation, `resetQueue`) et journal des erreurs d'envoi
  (`syncErrorLog.ts`, 20 dernières).
- Le trigger `set_updated_at` réécrit `updated_at` à l'heure **serveur** à
  chaque UPDATE : `flush()` mémorise celui renvoyé par ses propres UPDATE
  pour ne pas prendre sa propre écriture pour une modification plus récente
  d'un tiers (sinon une version mise en file pendant l'envoi, ou avec
  l'horloge du téléphone en retard, serait abandonnée — voir
  `planFlushEntry`, testé dans `offlineQueue.test.ts`).
- Push FCM **data-only** (pas de clé `notification`) : réveil silencieux,
  pas de popup système, pas de permission `POST_NOTIFICATIONS` (Android 13+)
  à demander.
- Jusqu'à **20 articles** affichés (`WIDGET_MAX_ITEMS`, dupliqué dans
  `useWidgetSync.ts` et `notify-item-change/index.ts` — pas de constante
  partagée entre l'app et l'Edge Function). Le layout RemoteViews
  (`widget_list_glance.xml`) a 20 lignes fixes (pas de `ListView`/
  `RemoteViewsService`) : changer ce nombre veut dire régénérer ce fichier
  et les tableaux `rowIds`/`textIds`/`checkIds` de `MagoWidgetProvider.kt`
  en même temps.

## Connexion (lien magique, PKCE)

- `flowType: 'pkce'` (`supabase.ts`) : le lien de l'e-mail
  (`{{ .ConfirmationURL }}`, modèle par défaut) revient sur
  `com.karelisio.mago://login-callback?code=…`, échangé par
  `exchangeCodeForSession` avec le `code_verifier` que supabase-js a gardé
  sur l'appareil qui a demandé le lien. Ouvert ailleurs, déjà servi ou
  expiré → message sur l'écran de connexion (« demande un nouveau lien
  depuis ce téléphone »). Seul le lien le plus récent fonctionne (un seul
  verifier gardé).
- **Plus jamais de `setSession()` avec des jetons lus dans une URL** (ancien
  flux implicite, `#access_token=…`) : n'importe quel lien forgé pouvait
  connecter le téléphone au compte de quelqu'un d'autre. Un lien demandé
  avec une ancienne version de l'app est donc refusé (en redemander un).
- `token_hash` (si le modèle d'e-mail pointe directement vers l'app) :
  `verifyOtp` seulement si un lien a été demandé depuis ce téléphone il y a
  moins d'une heure (marqueur `mago:pendingLogin`, effacé à la connexion).
- `AuthContext` lit aussi `App.getLaunchUrl()` : au démarrage à froid,
  l'`appUrlOpen` retenu par Capacitor n'est livré qu'au **premier**
  listener abonné (celui d'`ImportContext`, monté plus bas dans l'arbre donc
  abonné avant) — le lien de connexion était perdu si Android avait tué
  l'app pendant la lecture de l'e-mail. Même protection contre le rejeu que
  les imports (`handledLinks.ts`) : un lien déjà traité relivré au lancement
  est ignoré sans message ; déjà connecté·e → lien ignoré.
- Sur le web, `detectSessionInUrl` échange le `?code=` tout seul.

## Déconnexion (Réglages > Compte)

Rien du compte ne doit survivre pour le suivant sur le même téléphone :
1. la file de sync est d'abord envoyée (`flush()` attendu, 10 s max ; un
   `flush()` appelé pendant un autre renvoie la promesse en cours) ; s'il
   reste des écritures, confirmation « N modifications non synchronisées
   seront perdues » ;
2. `AuthContext.signOut()` retire la ligne `device_tokens` de CET appareil
   (jeton FCM courant, avant `auth.signOut` : RLS exige la session ;
   best-effort, 5 s max) — sinon les push des listes partagées de l'ancien
   compte continuaient d'arriver ici ;
3. `auth.signOut({ scope: 'local' })` (les autres appareils du compte
   restent connectés ; hors ligne, supabase-js retire quand même la session
   locale) ;
4. une fois la session partie : file vidée (`clearQueue` — écrite avec
   l'ancien `last_modified_by`, RLS la refuserait), `queryClient.clear()`
   (`['lists']` n'a pas d'id d'utilisateur : le compte suivant voyait les
   anciennes listes jusqu'à 30 s), préférence de liste du widget effacée,
   `WidgetBridge.clearSnapshot()` (widget sur son écran d'attente, push
   ignorés, voir plus haut).

## Catégories (listes et articles)

Tables `list_categories`/`item_categories`, partagées entre **tous les
utilisateurs authentifiés** (pas de scoping par couple — ce concept
n'existe pas dans le schéma, et Mago sert un seul couple en pratique;
une vraie app multi-tenant voudrait ça, ce serait de la sur-ingénierie ici).
La couleur d'une catégorie (`.list-dot`) est calculée par hash du nom
(`categoryTone()`), pas par une classe CSS fixe par valeur — voir
`theme.css` (`.list-dot.tone-0` à `.tone-5`).

Les listes sont groupées par type (une section par type, plusieurs listes
possibles par section) et triées dans chaque section par `lists.position`
(pas par nom) : les boutons monter/descendre de `Lists.tsx` échangent la
position de deux listes voisines du même type via `useLists.ts#swapPositions`
— pas de renumérotation globale à chaque déplacement. Le type est
optionnel à la création (seul le nom est exigé) : si `list_categories` est
vide, la liste est créée avec `type = ''` (le sélecteur de type est alors
masqué) et apparaît dans une section « Sans type », placée en dernier.

`lists.is_private` (choix à la création, `Lists.tsx`) : quand une liste est
privée, `add_owner_as_member()` n'ajoute pas le partenaire comme membre
(seul le propriétaire l'est) — le jumelage n'est donc plus "tout ou rien",
sans toucher aux policies RLS (`lists_select` repose déjà sur
`is_list_member`/`list_members`). Le partage ponctuel d'une liste précise
(`invites`, indépendant du jumelage) reste possible même sur une liste
privée. `accept_partner_invite()` saute aussi les listes privées au moment
du jumelage (0013) — sinon elles devenaient partagées rétroactivement.

Colonnes figées par trigger depuis l'API (0013, `current_user` =
`authenticated`/`anon` ; les fonctions SECURITY DEFINER passent) :
`lists.owner_id` (un membre pouvait se l'attribuer puis supprimer la liste)
et `invites.list_id`/`to_email`/`from_user` (une invitation réécrite vers
une autre liste permettait de la rejoindre via `accept_invite`). Les
écritures de la file de sync renvoient la ligne complète avec le même
`owner_id` : seule une vraie modification est refusée.

Supprimer une liste (`useLists.ts#deleteList`, articles supprimés en
cascade) : bouton affiché au/à la propriétaire seulement (policy
`lists_delete`), après confirmation (`ConfirmDialog`), réseau obligatoire
(pas de file de sync). Un DELETE filtré par RLS ne renvoie **aucune erreur**
(204, 0 ligne) : d'où le `.select('id')` — 0 ligne → message d'erreur et
liste remise en cache, sauf si sa création attendait encore dans la file
(liste créée hors ligne : suppression purement locale via `discard`).
Après suppression, les écritures encore en file pour la liste et ses
articles sont retirées : une ligne complète absente du serveur serait
réinsérée par `flush()` (liste ressuscitée).

## Imports externes (`mago://import`)

- Lien `mago://import?data=<base64url(JSON)>` (ou payload en dernier segment
  de chemin), format et validation zod dans `src/lib/externalImport.ts` —
  module pur, testé par `externalImport.test.ts` (`npm test`, lancé aussi en
  CI avant le build). Sur le web : `/import?data=…` pour tester.
- Réception dans `ImportContext` : `App.getLaunchUrl()` (démarrage à froid)
  + `appUrlOpen` (app déjà ouverte, activité `singleTask`) ; un doublon de la
  même URL dans les 3 s est ignoré. Le listener de `AuthContext` reçoit aussi
  ces URL et les ignore (pas un retour de connexion) — et inversement.
- **Rejeu de l'URL de lancement** : `getLaunchUrl()` la renvoie tant que
  l'activité vit (« Recharger l'app »), et Android recrée l'activité avec
  son intent d'origine après la mort du processus (retour par les récents)
  — Capacitor la relivre alors aussi en `appUrlOpen` (événement retenu).
  L'import était réappliqué (doublons, quantités additionnées deux fois).
  `handledLinks.ts` mémorise (Preferences, 50 dernières) l'empreinte des
  imports **traités** (appliqués, annulés ou refusés — pas un écran de
  confirmation jamais validé) ; un lien déjà traité livré **au lancement**
  (`getLaunchUrl`, ou `appUrlOpen` dans les 5 s qui suivent l'abonnement)
  est ignoré. Un lien reçu app déjà ouverte passe toujours : renvoyer
  volontairement le même import reste possible, sauf s'il relance l'app à
  froid (indiscernable d'un rejeu).
- Écritures via la file de sync (`useApplyImport.ts`) : marche hors ligne.
  Fusion = même nom + même unité (casse/accents ignorés), seulement avec un
  article non coché. Annuler = soft-delete des ajouts + restauration des
  lignes fusionnées ; si l'import avait créé la liste, `SyncContext.discard`
  retire les écritures encore en attente puis la liste est supprimée.
- Réglage "Importer sans confirmer" : n'agit que si listes et types de liste
  sont chargés, sinon retombe sur l'écran de confirmation (pas de doublon de
  liste créé à l'aveugle).
- Plusieurs imports : **file** dans `ImportContext` (`pending` = le premier,
  `clearPending()` passe au suivant). Un import reçu pendant qu'un autre est
  affiché ou appliqué attend son tour (en-tête « N autre(s) en attente ») ;
  avant, il remplaçait l'écran en cours, ou restait invisible et jamais
  appliqué pendant un import sans confirmation (`ImportHost` relance son
  effet à la fin de chaque import automatique).

## Mise à jour in-app, barre d'état

- `useAppUpdate.ts` ne propose une release que si son tag est **plus
  récent** (`version.ts` : tags `v<package.json>-<n° de run CI>` comparés
  numériquement partie par partie, n° de build compris) — un simple `!==`
  proposait aussi une version plus ancienne. `ApkInstallerPlugin` pose des
  délais de connexion (15 s) et de lecture (30 s).
- Icônes de la barre d'état (`statusBar.ts`) : style selon le thème
  **effectif** (préférence de Réglages, sinon système), réappliqué à chaque
  changement de l'un ou de l'autre.

## Git

Cette branche (`claude/mago-shared-list-app-65gd2s`) est réutilisée d'une PR
à l'autre. Une fois une PR mergée (squash), l'historique local diverge de
`origin/main` de façon non-fast-forwardable. Ne pas faire `git checkout -B`
(souvent bloqué par le sandbox) : faire `git merge origin/main` (merge
normal, pas `--ff-only`) avant de continuer — le contenu étant identique,
ça se résout sans conflit.
