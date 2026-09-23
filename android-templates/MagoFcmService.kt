package com.karelisio.mago

import android.content.Context
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

// Reçoit le push FCM data-only envoyé par l'Edge Function notify-item-change
// (voir supabase/functions/notify-item-change) : pas de "notification" dans
// le payload, donc pas de popup système, juste un réveil silencieux de
// l'app pour rafraîchir le widget. Le snapshot reçu (nom de liste, compteurs,
// jusqu'à 5 articles) est mis en cache dans des SharedPreferences dédiées,
// que MagoWidgetProvider relit pour se redessiner immédiatement.
class MagoFcmService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val data = remoteMessage.data
        if (data.isEmpty()) return

        val prefs = getSharedPreferences("mago_widget", Context.MODE_PRIVATE)
        val editor = prefs.edit()
        editor.putString("list_name", data["list_name"])
        editor.putString("remaining", data["remaining"])
        editor.putString("total", data["total"])
        for (i in 1..5) {
            val key = "item_$i"
            if (data.containsKey(key)) {
                editor.putString(key, data[key])
            } else {
                editor.remove(key)
            }
        }
        editor.apply()

        MagoWidgetProvider.refreshAll(applicationContext)
    }

    // FCM peut régénérer le token à tout moment, y compris app fermée : pas
    // de session JS à qui le donner sur le moment, donc on le met de côté
    // (même fichier de préférences que PushTokenPlugin) pour que le JS le
    // récupère et le synchronise au prochain passage au premier plan.
    override fun onNewToken(token: String) {
        getSharedPreferences("mago_push", Context.MODE_PRIVATE)
            .edit()
            .putString("pending_token", token)
            .apply()
    }
}
