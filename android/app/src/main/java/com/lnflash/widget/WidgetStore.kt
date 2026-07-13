package com.lnflash.widget

import android.content.Context

/**
 * Reads/writes the price snapshot shared between the React Native app and the
 * home-screen widget. On Android the widget lives in the same app process, so a
 * plain private [android.content.SharedPreferences] file is enough.
 */
object WidgetStore {
  private const val PREFS = "flash_widget"

  const val KEY_PRICE = "btcPrice"
  const val KEY_CURRENCY = "currencyCode"
  const val KEY_SYMBOL = "currencySymbol"
  const val KEY_FRACTION = "fractionDigits"
  const val KEY_TIMESTAMP = "timestamp"

  data class Snapshot(
    val btcPrice: Double,
    val currencyCode: String,
    val currencySymbol: String,
    val fractionDigits: Int,
    val timestamp: Double,
  ) {
    val hasPrice: Boolean get() = btcPrice > 0

    /** e.g. "$67,231" or "$67,231.50" depending on the currency's fraction digits. */
    fun formattedPrice(): String {
      if (!hasPrice) return "—"
      val formatted = String.format("%,.${fractionDigits}f", btcPrice)
      return "$currencySymbol$formatted"
    }
  }

  // Doubles are persisted as raw bits in a long — Float's ~7 significant
  // digits visibly corrupt high-denomination prices (JMD, IDR, VND).
  fun read(context: Context): Snapshot {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return Snapshot(
      btcPrice = Double.fromBits(p.getLong(KEY_PRICE, 0L)),
      currencyCode = p.getString(KEY_CURRENCY, "USD") ?: "USD",
      currencySymbol = p.getString(KEY_SYMBOL, "$") ?: "$",
      fractionDigits = p.getInt(KEY_FRACTION, 2),
      timestamp = Double.fromBits(p.getLong(KEY_TIMESTAMP, 0L)),
    )
  }

  fun write(context: Context, snapshot: Snapshot) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putLong(KEY_PRICE, snapshot.btcPrice.toRawBits())
      .putString(KEY_CURRENCY, snapshot.currencyCode)
      .putString(KEY_SYMBOL, snapshot.currencySymbol)
      .putInt(KEY_FRACTION, snapshot.fractionDigits)
      .putLong(KEY_TIMESTAMP, snapshot.timestamp.toRawBits())
      .apply()
  }
}
