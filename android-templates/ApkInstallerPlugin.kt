package com.karelisio.mago

import android.content.Intent
import androidx.core.content.FileProvider
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

// Télécharge l'APK d'une release GitHub et ouvre l'installeur de paquets
// Android dessus. Le téléchargement se fait dans le cache privé de l'app
// (pas besoin de DownloadManager, qui ne peut écrire que dans le stockage
// externe) ; le fichier est exposé à l'installeur via le FileProvider déjà
// déclaré par le template Capacitor (res/xml/file_paths.xml couvre déjà
// le cache dir via <cache-path path="."/>).
@CapacitorPlugin(name = "ApkInstaller")
class ApkInstallerPlugin : Plugin() {

    @PluginMethod
    fun downloadAndInstall(call: PluginCall) {
        val url = call.getString("url")
        if (url == null) {
            call.reject("url manquant")
            return
        }

        Thread {
            try {
                val destFile = File(context.cacheDir, "mago-update.apk")
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.instanceFollowRedirects = true
                connection.connect()

                if (connection.responseCode !in 200..299) {
                    throw Exception("HTTP ${connection.responseCode}")
                }

                connection.inputStream.use { input ->
                    FileOutputStream(destFile).use { output -> input.copyTo(output) }
                }

                val apkUri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    destFile
                )
                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(apkUri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }

                activity.runOnUiThread {
                    activity.startActivity(installIntent)
                    call.resolve()
                }
            } catch (e: Exception) {
                activity.runOnUiThread {
                    call.reject("Échec du téléchargement : ${e.message}")
                }
            }
        }.start()
    }
}
