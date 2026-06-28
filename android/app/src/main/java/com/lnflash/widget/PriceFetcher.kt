package com.lnflash.widget

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.pow

/**
 * Fetches a fresh BTC price using the public, unauthenticated `realtimePrice`
 * GraphQL query so the widget can refresh even while the app is closed. Runs on
 * a background thread (call from [FlashWidgetProvider.onUpdate]).
 */
object PriceFetcher {
  // Production Flash GraphQL endpoint (app/config/galoy-instances.ts → "Main").
  private const val ENDPOINT = "https://api.flashapp.me/graphql"

  private const val QUERY =
    "query realtimePriceUnauthed(\$currency: DisplayCurrency!) { " +
      "realtimePrice(currency: \$currency) { timestamp btcSatPrice { base offset } denominatorCurrency } }"

  /**
   * Fetches the latest price for [previous].currencyCode and returns an updated
   * snapshot (also persisted). Returns [previous] unchanged on any failure.
   */
  fun fetch(previous: WidgetStore.Snapshot): WidgetStore.Snapshot {
    return try {
      val conn = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 12_000
        readTimeout = 12_000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
      }

      val payload = JSONObject().apply {
        put("query", QUERY)
        put("variables", JSONObject().put("currency", previous.currencyCode))
      }
      conn.outputStream.use { it.write(payload.toString().toByteArray()) }

      if (conn.responseCode !in 200..299) return previous
      val body = conn.inputStream.bufferedReader().use { it.readText() }

      val realtime = JSONObject(body)
        .getJSONObject("data")
        .getJSONObject("realtimePrice")
      val btcSat = realtime.getJSONObject("btcSatPrice")
      val base = btcSat.getDouble("base")
      val offset = btcSat.getDouble("offset")

      // displayCurrencyPerSat is in the display currency's MINOR units per sat.
      // 1 BTC = 100,000,000 sats → major-unit price = perSat * 1e8 / 10^fractionDigits.
      val displayCurrencyPerSat = base / 10.0.pow(offset)
      val btcPrice = displayCurrencyPerSat * 100_000_000 / 10.0.pow(previous.fractionDigits)
      val timestamp = realtime.optDouble("timestamp", previous.timestamp)

      previous.copy(btcPrice = btcPrice, timestamp = timestamp)
    } catch (e: Exception) {
      previous
    }
  }
}
