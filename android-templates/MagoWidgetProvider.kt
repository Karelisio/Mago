package com.karelisio.mago

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

// Widget écran d'accueil (jusqu'à 20 articles — rowIds/textIds/checkIds et
// res/layout/widget_list_glance.xml doivent rester alignés sur ce nombre ;
// une seule liste : celle choisie dans Réglages, sinon la plus ancienne —
// voir useWidgetSync.ts). Se redessine depuis
// le dernier aperçu reçu par MagoFcmService ou par WidgetBridgePlugin (mis
// en cache dans les SharedPreferences "mago_widget"), et à intervalle
// régulier via updatePeriodMillis (secours seulement — voir
// res/xml/widget_info.xml).
//
// Cocher un article directement dans le widget ne fait AUCUN appel réseau
// natif : un patch (id, list_id, completed, last_modified_by, updated_at) est
// ajouté à la même queue de sync hors-ligne que le reste de l'app (voir
// offlineQueue.ts côté client), synchronisée normalement par
// SyncContext.flush() au prochain passage de l'app au premier plan. Ça évite
// complètement le problème d'un jeton d'accès natif à tenir à
// jour/rafraîchir depuis un widget.
class MagoWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            safeUpdateWidget(context, appWidgetManager, id)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_TOGGLE_ITEM) {
            val itemId = intent.getStringExtra(EXTRA_ITEM_ID)
            if (itemId != null) {
                // Même raison que safeUpdateWidget() : ce code tourne dans le
                // processus de l'app, une exception la fermerait.
                try {
                    toggleItem(context, itemId)
                } catch (e: Throwable) {
                    // Coche perdue, le widget garde son dernier état.
                }
            }
        }
    }

    private fun toggleItem(context: Context, itemId: String) {
        val prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE)
        val snapshot = parseSnapshot(prefs.getString(KEY_SNAPSHOT, null))
        val items = snapshot?.optJSONArray("items")
        val userId = snapshot?.optString("user_id", null)

        var target: JSONObject? = null
        if (items != null) {
            for (i in 0 until items.length()) {
                val obj = items.optJSONObject(i) ?: continue
                if (obj.optString("id", "") == itemId) {
                    target = obj
                    break
                }
            }
        }

        if (target == null || snapshot == null || userId.isNullOrEmpty()) {
            // Pas de donnée en cache pour cet article : filet de sécurité,
            // on ouvre l'app plutôt que de perdre l'action silencieusement.
            val openIntent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(openIntent)
            return
        }

        val completed = !target.optBoolean("completed", false)
        val now = isoNow()
        target.put("completed", completed)
        target.put("last_modified_by", userId)
        target.put("updated_at", now)
        // remaining couvre toute la liste, pas seulement les articles
        // affichés : on l'ajuste d'un cran au lieu de le recalculer.
        if (snapshot.has("remaining")) {
            val remaining = snapshot.optInt("remaining", 0) + if (completed) -1 else 1
            snapshot.put("remaining", maxOf(0, remaining))
        }

        prefs.edit().putString(KEY_SNAPSHOT, snapshot.toString()).apply()

        // Seules les colonnes réellement changées partent en file (patch), pas
        // la ligne du snapshot : elle peut être périmée (article renommé ou
        // retiré depuis) et écraserait ce changement, ou ressusciterait
        // l'article, une fois synchronisée.
        val patch = JSONObject()
        patch.put("id", itemId)
        val listId = target.optString("list_id", "").ifEmpty { snapshot.optString("list_id", "") }
        if (listId.isNotEmpty()) patch.put("list_id", listId)
        patch.put("completed", completed)
        patch.put("last_modified_by", userId)
        patch.put("updated_at", now)

        enqueueForSync(context, patch)
        refreshAll(context)
    }

    private fun enqueueForSync(context: Context, patch: JSONObject) {
        // Même stockage que @capacitor/preferences côté JS (groupe par défaut
        // "CapacitorStorage") et même format que offlineQueue.ts (QueueEntry,
        // champs version et patch compris), pour que SyncContext.flush()
        // synchronise cette entrée normalement.
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        synchronized(LOCK) {
            val raw = prefs.getString(SYNC_QUEUE_KEY, null)
            val queue = if (raw != null) JSONArray(raw) else JSONArray()
            val itemId = patch.optString("id")

            var merged = false
            val next = JSONArray()
            for (i in 0 until queue.length()) {
                val entry = queue.optJSONObject(i) ?: continue
                val entryRow = entry.optJSONObject("row")
                val isSameEntry = entry.optString("table") == "items" && entryRow?.optString("id") == itemId
                if (!isSameEntry) {
                    next.put(entry)
                    continue
                }
                // Doublon (ne devrait pas exister) : seule la première entrée est gardée.
                if (merged || entryRow == null) continue
                // Une entrée déjà en attente pour cet article (ajout/modification
                // faits dans l'app, ou coche précédente du widget) : on fusionne le
                // patch dans sa ligne, en gardant ses autres colonnes et son drapeau
                // patch — une ligne complète jamais encore envoyée doit rester
                // insérable telle quelle. Elle garde sa place dans la file, comme
                // enqueueEntry() côté JS (la file est envoyée dans l'ordre).
                for (key in patch.keys()) {
                    entryRow.put(key, patch.get(key))
                }
                stampNewVersion(entry)
                next.put(entry)
                merged = true
            }

            if (!merged) {
                val entry = JSONObject()
                entry.put("table", "items")
                entry.put("row", patch)
                entry.put("patch", true)
                stampNewVersion(entry)
                next.put(entry)
            }

            prefs.edit().putString(SYNC_QUEUE_KEY, next.toString()).apply()
        }
    }

    // Nouvelle version à chaque mise en file : un flush JS en cours d'envoi de
    // l'ancienne version ne retirera pas celle-ci. Le compteur d'échecs
    // définitifs (attempts, voir offlineQueue.ts) repart de zéro, comme pour
    // une nouvelle version mise en file côté JS.
    private fun stampNewVersion(entry: JSONObject) {
        entry.put("enqueuedAt", isoNow())
        entry.put("version", UUID.randomUUID().toString())
        entry.remove("attempts")
    }

    private fun isoNow(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    companion object {
        private const val ACTION_TOGGLE_ITEM = "com.karelisio.mago.TOGGLE_ITEM"
        private const val EXTRA_ITEM_ID = "item_id"
        private const val PREFS_WIDGET = "mago_widget"
        private const val KEY_SNAPSHOT = "snapshot_json"
        private const val SYNC_QUEUE_KEY = "mago_sync_queue_v1"
        private val LOCK = Any()

        fun refreshAll(context: Context) {
            try {
                val manager = AppWidgetManager.getInstance(context)
                val ids = manager.getAppWidgetIds(ComponentName(context, MagoWidgetProvider::class.java))
                for (id in ids) {
                    safeUpdateWidget(context, manager, id)
                }
            } catch (e: Throwable) {
                // Voir safeUpdateWidget().
            }
        }

        // Le rendu du widget tourne dans le processus de l'app (onUpdate, push
        // FCM, WidgetBridgePlugin appelé par le JS) : une exception non
        // rattrapée ici fermerait Mago entièrement. Throwable et pas seulement
        // Exception, pour couvrir aussi OutOfMemoryError.
        private fun safeUpdateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            try {
                updateWidget(context, appWidgetManager, appWidgetId)
            } catch (e: Throwable) {
                // Le widget garde son dernier rendu.
            }
        }

        private fun parseSnapshot(raw: String?): JSONObject? {
            if (raw == null) return null
            return try {
                JSONObject(raw)
            } catch (e: Throwable) {
                null
            }
        }

        private fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE)
            val views = RemoteViews(context.packageName, R.layout.widget_list_glance)
            // Absent (widget jamais alimenté) ou illisible : même écran d'attente.
            val snapshot = parseSnapshot(prefs.getString(KEY_SNAPSHOT, null))

            val rowIds = intArrayOf(R.id.widget_item_1, R.id.widget_item_2, R.id.widget_item_3, R.id.widget_item_4, R.id.widget_item_5, R.id.widget_item_6, R.id.widget_item_7, R.id.widget_item_8, R.id.widget_item_9, R.id.widget_item_10, R.id.widget_item_11, R.id.widget_item_12, R.id.widget_item_13, R.id.widget_item_14, R.id.widget_item_15, R.id.widget_item_16, R.id.widget_item_17, R.id.widget_item_18, R.id.widget_item_19, R.id.widget_item_20)
            val textIds = intArrayOf(
                R.id.widget_item_text_1,
                R.id.widget_item_text_2,
                R.id.widget_item_text_3,
                R.id.widget_item_text_4,
                R.id.widget_item_text_5,
                R.id.widget_item_text_6,
                R.id.widget_item_text_7,
                R.id.widget_item_text_8,
                R.id.widget_item_text_9,
                R.id.widget_item_text_10,
                R.id.widget_item_text_11,
                R.id.widget_item_text_12,
                R.id.widget_item_text_13,
                R.id.widget_item_text_14,
                R.id.widget_item_text_15,
                R.id.widget_item_text_16,
                R.id.widget_item_text_17,
                R.id.widget_item_text_18,
                R.id.widget_item_text_19,
                R.id.widget_item_text_20
            )
            val checkIds = intArrayOf(
                R.id.widget_item_check_1,
                R.id.widget_item_check_2,
                R.id.widget_item_check_3,
                R.id.widget_item_check_4,
                R.id.widget_item_check_5,
                R.id.widget_item_check_6,
                R.id.widget_item_check_7,
                R.id.widget_item_check_8,
                R.id.widget_item_check_9,
                R.id.widget_item_check_10,
                R.id.widget_item_check_11,
                R.id.widget_item_check_12,
                R.id.widget_item_check_13,
                R.id.widget_item_check_14,
                R.id.widget_item_check_15,
                R.id.widget_item_check_16,
                R.id.widget_item_check_17,
                R.id.widget_item_check_18,
                R.id.widget_item_check_19,
                R.id.widget_item_check_20
            )

            if (snapshot == null) {
                views.setTextViewText(R.id.widget_list_name, "Mago")
                views.setTextViewText(R.id.widget_subtitle, "Ouvre l'app pour charger ta liste")
                for (rowId in rowIds) views.setViewVisibility(rowId, View.GONE)
            } else {
                // Articles allégés (id, list_id, name, qty, unit, completed) :
                // toujours opt* avec une valeur par défaut, jamais get*.
                val listName = snapshot.optString("list_name", "Mago")
                val items = snapshot.optJSONArray("items") ?: JSONArray()
                val total = snapshot.optInt("total", items.length())
                var shownRemaining = 0
                for (i in 0 until items.length()) {
                    val item = items.optJSONObject(i) ?: continue
                    if (!item.optBoolean("completed", false)) shownRemaining++
                }
                // remaining compte toute la liste ; repli sur les articles
                // affichés pour un snapshot d'une version qui ne l'envoyait pas.
                val remaining = snapshot.optInt("remaining", shownRemaining)

                views.setTextViewText(R.id.widget_list_name, listName)
                views.setTextViewText(R.id.widget_subtitle, "$remaining restants sur $total")

                for (i in rowIds.indices) {
                    val item = if (i < items.length()) items.optJSONObject(i) else null
                    if (item != null) {
                        val completed = item.optBoolean("completed", false)
                        views.setViewVisibility(rowIds[i], View.VISIBLE)
                        views.setTextViewText(textIds[i], item.optString("name", ""))
                        views.setImageViewResource(
                            checkIds[i],
                            if (completed) R.drawable.widget_checkbox_checked else R.drawable.widget_checkbox_unchecked
                        )
                        val paintFlags = if (completed) {
                            Paint.STRIKE_THRU_TEXT_FLAG or Paint.ANTI_ALIAS_FLAG
                        } else {
                            Paint.ANTI_ALIAS_FLAG
                        }
                        views.setInt(textIds[i], "setPaintFlags", paintFlags)

                        val itemId = item.optString("id", "")
                        val toggleIntent = Intent(context, MagoWidgetProvider::class.java).apply {
                            action = ACTION_TOGGLE_ITEM
                            putExtra(EXTRA_ITEM_ID, itemId)
                            data = Uri.parse("mago-widget://toggle/$itemId")
                        }
                        val togglePendingIntent = PendingIntent.getBroadcast(
                            context,
                            0,
                            toggleIntent,
                            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                        )
                        views.setOnClickPendingIntent(checkIds[i], togglePendingIntent)
                    } else {
                        views.setViewVisibility(rowIds[i], View.GONE)
                    }
                }
            }

            val openAppIntent = Intent(context, MainActivity::class.java)
            val openAppPendingIntent = PendingIntent.getActivity(
                context,
                0,
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, openAppPendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
