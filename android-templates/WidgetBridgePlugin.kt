package com.karelisio.mago

import android.content.Context
import com.getcapacitor.JSArray
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

// Permet à l'app JS d'alimenter directement le cache du widget (ouverture de
// l'app, changement local, mise à jour temps réel via Supabase Realtime),
// en plus du chemin FCM (MagoFcmService) qui couvre le cas app fermée. Même
// fichier de préférences et mêmes clés que MagoFcmService, pour rester une
// seule source de vérité pour MagoWidgetProvider.
@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {

    @PluginMethod
    fun updateSnapshot(call: PluginCall) {
        val listName = call.getString("listName")
        val remaining = call.getInt("remaining", 0)
        val total = call.getInt("total", 0)
        val items = call.getArray("items") ?: JSArray()

        val prefs = context.getSharedPreferences("mago_widget", Context.MODE_PRIVATE)
        val editor = prefs.edit()
        editor.putString("list_name", listName)
        editor.putString("remaining", remaining.toString())
        editor.putString("total", total.toString())
        for (i in 0 until 5) {
            val key = "item_${i + 1}"
            if (i < items.length()) {
                editor.putString(key, items.getString(i))
            } else {
                editor.remove(key)
            }
        }
        editor.apply()

        MagoWidgetProvider.refreshAll(context)
        call.resolve()
    }
}
