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

- Une seule liste fixe (v1, pas de config) : **la première par
  `created_at` ascendant**, même tri que `useLists.ts`. Si ce tri change un
  jour, le widget change de liste en même temps — c'est voulu.
- Snapshot unique en JSON, stocké dans les `SharedPreferences` "mago_widget"
  sous la clé "snapshot_json", forme `{list_id, list_name, user_id, total,
  items: ItemRow[]}` (noms de colonnes Postgres exacts pour `items`, voir
  plus bas). Alimenté par deux chemins qui doivent rester au même format :
  `WidgetBridgePlugin.updateSnapshot()` (app ouverte, JS) et
  `MagoFcmService.onMessageReceived()` (app fermée, push FCM data-only —
  l'Edge Function `notify-item-change` construit exactement ce JSON et
  l'envoie sous une seule clé `snapshot` pour éviter d'avoir deux formats
  à maintenir).
- **Cocher un article depuis le widget ne fait aucun appel réseau natif.**
  La ligne mise à jour est ajoutée directement dans la queue de sync
  hors-ligne de l'app (mêmes `SharedPreferences` que
  `@capacitor/preferences`, groupe par défaut `"CapacitorStorage"`, clé
  `"mago_sync_queue_v1"`, même format que `QueueEntry` dans
  `offlineQueue.ts`). `SyncContext.flush()` la synchronise normalement à la
  prochaine ouverture de l'app — aucun jeton d'accès natif à maintenir. Si
  cette queue change de nom/clé/format côté JS, `MagoWidgetProvider.kt`
  doit être mis à jour en même temps.
- Push FCM **data-only** (pas de clé `notification`) : réveil silencieux,
  pas de popup système, pas de permission `POST_NOTIFICATIONS` (Android 13+)
  à demander.

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
— pas de renumérotation globale à chaque déplacement.

## Git

Cette branche (`claude/mago-shared-list-app-65gd2s`) est réutilisée d'une PR
à l'autre. Une fois une PR mergée (squash), l'historique local diverge de
`origin/main` de façon non-fast-forwardable. Ne pas faire `git checkout -B`
(souvent bloqué par le sandbox) : faire `git merge origin/main` (merge
normal, pas `--ff-only`) avant de continuer — le contenu étant identique,
ça se résout sans conflit.
