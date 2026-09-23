package com.karelisio.mago

import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

// Expose la palette Material You dynamique (Android 12+, extraite du fond
// d'écran de l'utilisateur) au JS, pour qu'elle remplace la palette CSS fixe
// quand elle est disponible. Les tons system_accent1_x / system_neutral2_x
// suivent le mapping standard du schéma de couleurs dynamiques Material 3
// (primary = accent1 ton 40/80, primaryContainer = accent1 ton 90/30, etc).
@CapacitorPlugin(name = "DynamicColor")
class DynamicColorPlugin : Plugin() {

    @PluginMethod
    fun getColors(call: PluginCall) {
        val result = JSObject()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            result.put("available", true)
            result.put("light", buildPalette(dark = false))
            result.put("dark", buildPalette(dark = true))
        } else {
            result.put("available", false)
        }
        call.resolve(result)
    }

    private fun buildPalette(dark: Boolean): JSObject {
        val palette = JSObject()
        if (!dark) {
            palette.put("primary", hex(android.R.color.system_accent1_600))
            palette.put("onPrimary", hex(android.R.color.system_accent1_0))
            palette.put("primaryContainer", hex(android.R.color.system_accent1_100))
            palette.put("onPrimaryContainer", hex(android.R.color.system_accent1_900))
            palette.put("surfaceVariant", hex(android.R.color.system_neutral2_100))
            palette.put("onSurfaceVariant", hex(android.R.color.system_neutral2_700))
            palette.put("outline", hex(android.R.color.system_neutral2_500))
        } else {
            palette.put("primary", hex(android.R.color.system_accent1_200))
            palette.put("onPrimary", hex(android.R.color.system_accent1_800))
            palette.put("primaryContainer", hex(android.R.color.system_accent1_700))
            palette.put("onPrimaryContainer", hex(android.R.color.system_accent1_100))
            palette.put("surfaceVariant", hex(android.R.color.system_neutral2_700))
            palette.put("onSurfaceVariant", hex(android.R.color.system_neutral2_200))
            palette.put("outline", hex(android.R.color.system_neutral2_400))
        }
        return palette
    }

    private fun hex(resId: Int): String {
        val color = ContextCompat.getColor(context, resId)
        return String.format("#%06X", 0xFFFFFF and color)
    }
}
