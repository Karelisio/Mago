package com.karelisio.mago

import android.content.Context
import android.content.SharedPreferences
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.firebase.messaging.FirebaseMessaging

// Expose le token FCM de l'appareil au JS (pour l'enregistrer dans
// device_tokens), et gère le cas où MagoFcmService reçoit un nouveau
// token pendant que l'app est fermée (pas de session JS à qui le donner
// sur le moment) : il est mis de côté dans des SharedPreferences, et le
// JS le récupère/l'efface au prochain démarrage via getPendingToken /
// clearPendingToken.
@CapacitorPlugin(name = "PushToken")
class PushTokenPlugin : Plugin() {

    private fun prefs(): SharedPreferences =
        context.getSharedPreferences("mago_push", Context.MODE_PRIVATE)

    @PluginMethod
    fun getFcmToken(call: PluginCall) {
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                val ret = JSObject()
                ret.put("token", token)
                call.resolve(ret)
            }
            .addOnFailureListener { e ->
                call.reject("Impossible de récupérer le token FCM : ${e.message}")
            }
    }

    @PluginMethod
    fun getPendingToken(call: PluginCall) {
        val ret = JSObject()
        ret.put("token", prefs().getString("pending_token", null))
        call.resolve(ret)
    }

    @PluginMethod
    fun clearPendingToken(call: PluginCall) {
        prefs().edit().remove("pending_token").apply()
        call.resolve()
    }
}
