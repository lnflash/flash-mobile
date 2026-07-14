package com.lnflash.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.RemoteViews
import com.lnflash.R

/**
 * Home-screen widget showing the live BTC price plus Scan / Receive quick
 * actions. Picks a small / medium / large layout based on the widget's current
 * size and refreshes the price in the background on each update.
 */
class FlashWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    // Render the cached snapshot immediately — the receiver process can be
    // killed shortly after onReceive returns, before a network fetch
    // completes, so the fetch below is best-effort.
    val cached = WidgetStore.read(context)
    for (id in appWidgetIds) {
      renderWidget(context, appWidgetManager, id, cached)
    }
    Thread {
      val snapshot = PriceFetcher.fetch(cached)
      WidgetStore.write(context, snapshot)
      for (id in appWidgetIds) {
        renderWidget(context, appWidgetManager, id, snapshot)
      }
    }.start()
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle,
  ) {
    renderWidget(context, appWidgetManager, appWidgetId, WidgetStore.read(context))
  }

  private fun renderWidget(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    snapshot: WidgetStore.Snapshot,
  ) {
    val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
    val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
    val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)

    val layoutId = when {
      minHeight >= 180 -> R.layout.flash_widget_large
      minWidth >= 180 -> R.layout.flash_widget_medium
      else -> R.layout.flash_widget_small
    }

    val views = RemoteViews(context.packageName, layoutId).apply {
      setTextViewText(R.id.widget_price, snapshot.formattedPrice())
      setTextViewText(R.id.widget_currency, snapshot.currencyCode)

      // Whole-widget tap opens the app via a plain launch intent (a deep link
      // here would fall through to the ":payment" route). Action buttons use
      // widget/-namespaced deep links that can never collide with a username.
      launchAppIntent(context)?.let { setOnClickPendingIntent(R.id.widget_root, it) }
      if (layoutId != R.layout.flash_widget_small) {
        setOnClickPendingIntent(
          R.id.widget_btn_scan,
          deepLinkIntent(context, "flash://widget/scan"),
        )
        setOnClickPendingIntent(
          R.id.widget_btn_receive,
          deepLinkIntent(context, "flash://widget/receive"),
        )
      }
    }

    appWidgetManager.updateAppWidget(appWidgetId, views)
  }

  private fun launchAppIntent(context: Context): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?.apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP) }
      ?: return null
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun deepLinkIntent(context: Context, uri: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(
      context,
      uri.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
