package com.karelisio.mago

import android.content.Context
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

// Reçoit le push FCM data-only envoyé par l'Edge Function notify-item-change
// (voir supabase/functions/notify-item-change) : pas de "notification" dans
// le payload, donc pas de popup système, juste un réveil silencieux de
// l'app pour rafraîchir le widget. Le snapshot reçu (JSON déjà entièrement
// formé côté Edge Function : nom de liste, compteur, jusqu'à 5 lignes
// d'articles complètes) est stocké tel quel, dans le même format et sous la
// même clé que WidgetBridgePlugin (mis à jour directement par l'app) — une
// seule source de vérité pour MagoWidgetProvider.
class MagoFcmService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val snapshotJson = remoteMessage.data["snapshot"] ?: return

        getSharedPreferences("mago_widget", Context.MODE_PRIVATE)
            .edit()
            .putString("snapshot_json", snapshotJson)
            .apply()

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
