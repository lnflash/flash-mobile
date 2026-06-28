package com.lnflash.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

/**
 * React Native native module. The JS layer (app/utils/widget.ts) calls
 * [setPriceData] on every price poll so the widget renders the user's display
 * currency, then we ask AppWidgetManager to redraw all widget instances.
 */
class WidgetBridgeModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "WidgetBridge"

  @ReactMethod
  fun setPriceData(data: ReadableMap, promise: Promise) {
    try {
      val context = reactApplicationContext
      val snapshot = WidgetStore.Snapshot(
        btcPrice = if (data.hasKey("btcPrice")) data.getDouble("btcPrice") else 0.0,
        currencyCode = if (data.hasKey("currencyCode")) data.getString("currencyCode") ?: "USD" else "USD",
        currencySymbol = if (data.hasKey("currencySymbol")) data.getString("currencySymbol") ?: "$" else "$",
        fractionDigits = if (data.hasKey("fractionDigits")) data.getInt("fractionDigits") else 2,
        timestamp = if (data.hasKey("timestamp")) data.getDouble("timestamp") else 0.0,
      )
      WidgetStore.write(context, snapshot)

      // Trigger an onUpdate for every Flash widget instance.
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(
        ComponentName(context, FlashWidgetProvider::class.java),
      )
      if (ids.isNotEmpty()) {
        val intent = android.content.Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
          setClass(context, FlashWidgetProvider::class.java)
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        }
        context.sendBroadcast(intent)
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("widget_error", e)
    }
  }
}
