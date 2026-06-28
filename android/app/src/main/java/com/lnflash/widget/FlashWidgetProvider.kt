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
    // Refresh price off the main thread, then re-render every instance.
    Thread {
      val snapshot = PriceFetcher.fetch(WidgetStore.read(context))
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

      // Whole-widget tap opens the app; action buttons deep-link to screens.
      setOnClickPendingIntent(R.id.widget_root, deepLinkIntent(context, "flash://home"))
      if (layoutId != R.layout.flash_widget_small) {
        setOnClickPendingIntent(R.id.widget_btn_scan, deepLinkIntent(context, "flash://scan"))
        setOnClickPendingIntent(R.id.widget_btn_receive, deepLinkIntent(context, "flash://receive"))
      }
    }

    appWidgetManager.updateAppWidget(appWidgetId, views)
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
