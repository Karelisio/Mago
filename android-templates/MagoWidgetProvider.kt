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

// Widget écran d'accueil (une seule liste fixe pour la v1, la plus ancienne
// — voir Lists.tsx/useLists.ts qui trie par created_at). Se redessine depuis
// le dernier aperçu reçu par MagoFcmService ou par WidgetBridgePlugin (mis
// en cache dans les SharedPreferences "mago_widget"), et à intervalle
// régulier via updatePeriodMillis (secours seulement — voir
// res/xml/widget_info.xml).
//
// Cocher un article directement dans le widget ne fait AUCUN appel réseau
// natif : la ligne mise à jour est ajoutée telle quelle à la même queue de
// sync hors-ligne que le reste de l'app (voir offlineQueue.ts côté client),
// synchronisée normalement par SyncContext.flush() à la prochaine ouverture
// de l'app. Ça évite complètement le problème d'un jeton d'accès natif à
// tenir à jour/rafraîchir depuis un widget.
class MagoWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            updateWidget(context, appWidgetManager, id)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_TOGGLE_ITEM) {
            val itemId = intent.getStringExtra(EXTRA_ITEM_ID)
            if (itemId != null) toggleItem(context, itemId)
        }
    }

    private fun toggleItem(context: Context, itemId: String) {
        val prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE)
        val snapshotRaw = prefs.getString(KEY_SNAPSHOT, null)
        val snapshot = if (snapshotRaw != null) JSONObject(snapshotRaw) else null
        val items = snapshot?.optJSONArray("items")
        val userId = snapshot?.optString("user_id", null)

        var target: JSONObject? = null
        if (items != null) {
            for (i in 0 until items.length()) {
                val obj = items.getJSONObject(i)
                if (obj.optString("id") == itemId) {
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

        target.put("completed", !target.optBoolean("completed", false))
        target.put("last_modified_by", userId)
        target.put("updated_at", isoNow())

        prefs.edit().putString(KEY_SNAPSHOT, snapshot.toString()).apply()

        enqueueForSync(context, target)
        refreshAll(context)
    }

    private fun enqueueForSync(context: Context, row: JSONObject) {
        // Même stockage que @capacitor/preferences côté JS (groupe par défaut
        // "CapacitorStorage") et même format que offlineQueue.ts (QueueEntry),
        // pour que SyncContext.flush() synchronise cette entrée normalement.
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        synchronized(LOCK) {
            val raw = prefs.getString(SYNC_QUEUE_KEY, null)
            val queue = if (raw != null) JSONArray(raw) else JSONArray()
            val itemId = row.optString("id")

            val next = JSONArray()
            for (i in 0 until queue.length()) {
                val entry = queue.getJSONObject(i)
                val entryRow = entry.optJSONObject("row")
                val isSameEntry = entry.optString("table") == "items" && entryRow?.optString("id") == itemId
                if (!isSameEntry) next.put(entry)
            }
            val newEntry = JSONObject()
            newEntry.put("table", "items")
            newEntry.put("row", row)
            newEntry.put("enqueuedAt", isoNow())
            next.put(newEntry)

            prefs.edit().putString(SYNC_QUEUE_KEY, next.toString()).apply()
        }
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
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, MagoWidgetProvider::class.java))
            for (id in ids) {
                updateWidget(context, manager, id)
            }
        }

        private fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE)
            val views = RemoteViews(context.packageName, R.layout.widget_list_glance)
            val snapshotRaw = prefs.getString(KEY_SNAPSHOT, null)

            val rowIds = intArrayOf(R.id.widget_item_1, R.id.widget_item_2, R.id.widget_item_3, R.id.widget_item_4, R.id.widget_item_5)
            val textIds = intArrayOf(
                R.id.widget_item_text_1,
                R.id.widget_item_text_2,
                R.id.widget_item_text_3,
                R.id.widget_item_text_4,
                R.id.widget_item_text_5
            )
            val checkIds = intArrayOf(
                R.id.widget_item_check_1,
                R.id.widget_item_check_2,
                R.id.widget_item_check_3,
                R.id.widget_item_check_4,
                R.id.widget_item_check_5
            )

            if (snapshotRaw == null) {
                views.setTextViewText(R.id.widget_list_name, "Mago")
                views.setTextViewText(R.id.widget_subtitle, "Ouvre l'app pour charger ta liste")
                for (rowId in rowIds) views.setViewVisibility(rowId, View.GONE)
            } else {
                val snapshot = JSONObject(snapshotRaw)
                val listName = snapshot.optString("list_name", "Mago")
                val items = snapshot.optJSONArray("items") ?: JSONArray()
                val total = snapshot.optInt("total", items.length())
                var remaining = 0
                for (i in 0 until items.length()) {
                    if (!items.getJSONObject(i).optBoolean("completed", false)) remaining++
                }

                views.setTextViewText(R.id.widget_list_name, listName)
                views.setTextViewText(R.id.widget_subtitle, "$remaining restants sur $total")

                for (i in rowIds.indices) {
                    if (i < items.length()) {
                        val item = items.getJSONObject(i)
                        val completed = item.optBoolean("completed", false)
                        views.setViewVisibility(rowIds[i], View.VISIBLE)
                        views.setTextViewText(textIds[i], item.optString("name"))
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

                        val itemId = item.optString("id")
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
