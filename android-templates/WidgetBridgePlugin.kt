package com.karelisio.mago

import android.content.Context
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

// Permet à l'app JS d'alimenter directement le cache du widget (ouverture de
// l'app, changement local, mise à jour temps réel via Supabase Realtime),
// en plus du chemin FCM (MagoFcmService) qui couvre le cas app fermée. Le
// payload JS (list_id, list_name, user_id, total, items[]) est stocké tel
// quel : PluginCall.getData() est déjà un JSONObject (JSObject en étend
// un), donc pas besoin de le reconstruire champ par champ — même format
// que celui écrit par MagoFcmService, une seule source de vérité pour
// MagoWidgetProvider.
@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {

    @PluginMethod
    fun updateSnapshot(call: PluginCall) {
        val snapshotJson = call.data.toString()

        context.getSharedPreferences("mago_widget", Context.MODE_PRIVATE)
            .edit()
            .putString("snapshot_json", snapshotJson)
            .apply()

        MagoWidgetProvider.refreshAll(context)
        call.resolve()
    }
}
