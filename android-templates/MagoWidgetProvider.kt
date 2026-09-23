package com.karelisio.mago

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews

// Widget écran d'accueil (une seule liste fixe pour la v1, la plus ancienne
// — voir Lists.tsx/useLists.ts qui trie par created_at). Se redessine depuis
// le dernier aperçu reçu par MagoFcmService (mis en cache dans les
// SharedPreferences "mago_widget"), et à intervalle régulier via
// updatePeriodMillis (secours seulement — voir res/xml/widget_info.xml et
// la Phase 4 pour le rattrapage réel après un push manqué).
class MagoWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            updateWidget(context, appWidgetManager, id)
        }
    }

    companion object {
        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, MagoWidgetProvider::class.java))
            for (id in ids) {
                updateWidget(context, manager, id)
            }
        }

        private fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val prefs = context.getSharedPreferences("mago_widget", Context.MODE_PRIVATE)
            val views = RemoteViews(context.packageName, R.layout.widget_list_glance)

            val listName = prefs.getString("list_name", null)
            if (listName != null) {
                views.setTextViewText(R.id.widget_list_name, listName)
                val remaining = prefs.getString("remaining", "0")
                val total = prefs.getString("total", "0")
                views.setTextViewText(R.id.widget_subtitle, "$remaining restants sur $total")
            } else {
                views.setTextViewText(R.id.widget_list_name, "Mago")
                views.setTextViewText(R.id.widget_subtitle, "Ouvre l'app pour charger ta liste")
            }

            val itemViewIds = intArrayOf(
                R.id.widget_item_1,
                R.id.widget_item_2,
                R.id.widget_item_3,
                R.id.widget_item_4,
                R.id.widget_item_5
            )
            for ((index, viewId) in itemViewIds.withIndex()) {
                val name = prefs.getString("item_${index + 1}", null)
                if (name != null) {
                    views.setTextViewText(viewId, name)
                    views.setViewVisibility(viewId, View.VISIBLE)
                } else {
                    views.setViewVisibility(viewId, View.GONE)
                }
            }

            val openAppIntent = Intent(context, MainActivity::class.java)
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
