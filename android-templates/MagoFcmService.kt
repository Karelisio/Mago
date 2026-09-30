package com.karelisio.mago

import android.content.Context
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

// Reçoit le push FCM data-only envoyé par l'Edge Function notify-item-change
// (voir supabase/functions/notify-item-change) : pas de "notification" dans
// le payload, donc pas de popup système, juste un réveil silencieux de
// l'app pour rafraîchir le widget. Le snapshot reçu (JSON déjà entièrement
// formé côté Edge Function : nom de liste, compteurs total/remaining,
// jusqu'à 20 articles non cochés allégés — moins si la limite de 4 Ko du
// push l'impose) est stocké tel quel, dans le même format et sous la même
// clé que WidgetBridgePlugin (mis à jour directement par l'app) — une seule
// source de vérité pour MagoWidgetProvider.
class MagoFcmService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val snapshotJson = remoteMessage.data["snapshot"] ?: return
        val prefs = getSharedPreferences("mago_widget", Context.MODE_PRIVATE)

        // Déconnexion depuis l'app (WidgetBridgePlugin.clearSnapshot) : un push
        // encore adressé à l'ancien compte (jeton pas encore retiré de
        // device_tokens, ou déjà en route) ne doit pas réafficher sa liste.
        // Levé par le prochain aperçu envoyé par l'app connectée.
        if (prefs.getBoolean("signed_out", false)) return

        // Le push concerne la liste modifiée, quelle qu'elle soit, alors que le
        // widget affiche une liste précise (choisie dans Réglages, sinon la
        // plus ancienne) : un snapshot d'une autre liste ne doit pas la
        // remplacer. Sans snapshot déjà stocké (widget jamais alimenté par
        // l'app), le push est accepté tel quel — sauf après une déconnexion
        // (ci-dessus).
        val incomingListId = try {
            JSONObject(snapshotJson).optString("list_id", "")
        } catch (e: Throwable) {
            return // JSON malformé : ignoré
        }
        val storedListId = try {
            val stored = prefs.getString("snapshot_json", null)
            if (stored != null) JSONObject(stored).optString("list_id", "") else ""
        } catch (e: Throwable) {
            "" // snapshot stocké illisible : autant le remplacer
        }
        if (storedListId.isNotEmpty() && storedListId != incomingListId) return

        prefs.edit()
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
