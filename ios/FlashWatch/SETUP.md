# Flash watchOS app + complication — Xcode setup

All Swift sources, `Info.plist`s, and entitlements are scaffolded on disk. The
remaining steps create the two watch targets and wire the files into Xcode
(these edit `project.pbxproj`, so they're done in the GUI to avoid corrupting
it — same approach as `ios/FlashWidget/SETUP.md`). Do everything in
`ios/LNFlash.xcworkspace`, **not** the `.xcodeproj`.

> **What ships here**
> - `ios/FlashWatch Watch App/` — the SwiftUI watch app (live BTC price, refresh, Scan/Receive hand-off).
> - `ios/FlashWatchComplication/` — a WidgetKit complication (circular, inline, rectangular, corner).
> - `ios/LNFlash/WatchConnectivityBridge.{swift,m}` — phone-side RN module that pushes the user's display currency to the watch and opens `flash://` deep links from watch quick-actions.
> - `app/utils/watch.ts` + `app/components/watch-currency-sync/` — JS that calls the bridge (already mounted in `app/graphql/client.tsx`).

## Architecture (why it's built this way)

- The watch is a **separate device**, so it can't read the iOS App Group
  `group.com.lnflash`. Instead the watch app and its complication share a
  **watch-local** App Group, `group.com.lnflash.watch`.
- The watch **fetches the BTC price itself** from the public, unauthenticated
  `realtimePrice` GraphQL query (`https://api.flashapp.me/graphql`) — the same
  query the home-screen widget uses. So it shows a price even with the phone
  away and before the user logs in (defaults to USD).
- **WatchConnectivity** carries only the user's *display currency* from phone →
  watch, so the watch reprices in the user's chosen currency. This is
  best-effort personalization; the watch is fully functional without it.
- The complication uses **WidgetKit accessory families** (watchOS 9+). ClockKit
  is deprecated and is not used.

## 1. Add the phone-side bridge to the app target

The native module that pushes currency to the watch lives in the **main app**
target.

1. In Xcode, right-click the `LNFlash` group → **Add Files to "LNFlash"…**
2. Select `ios/LNFlash/WatchConnectivityBridge.swift` and
   `ios/LNFlash/WatchConnectivityBridge.m`.
3. **Target membership = LNFlash** (the app), **not** any watch target.
   - The project already has a bridging header (`LNFlash-Bridging-Header.h`), so
     no new-header prompt should appear. If it does, **Don't create**.

## 2. Create the watch app target

1. **File → New → Target… → watchOS → App** → **Next**.
2. Product Name: **FlashWatch**. Interface: **SwiftUI**. Language: **Swift**.
   Uncheck "Include Notification Scene". For "Include Complication", see step 3
   (we add our own WidgetKit extension, so you can leave it unchecked).
3. Set the watch app's bundle id to **`com.lnflash.watchkitapp`** and confirm
   its **WKCompanionAppBundleIdentifier** points at the app (`com.lnflash`) —
   the provided `Info.plist` already sets this. Team: your usual signing team.
   **Finish**.
4. When asked to **Activate "FlashWatch" scheme?** → **Activate**.
5. Xcode generates a `FlashWatch Watch App/` group with a starter
   `FlashWatchApp.swift`, `ContentView.swift`, `Assets.xcassets`, and
   `Info.plist`. **Delete** the generated `FlashWatchApp.swift` and
   `ContentView.swift` (Move to Trash) — we provide our own. Keep the generated
   `Assets.xcassets` (add an `AccentColor` / app icon as desired).

## 3. Add the scaffolded watch-app sources

Add these (already on disk in `ios/FlashWatch Watch App/`) with **Target
membership = FlashWatch Watch App** only:

- `FlashWatchApp.swift`
- `ContentView.swift`
- `PriceService.swift`
- `WatchStore.swift`
- `PhoneConnectivity.swift`

Use the provided `Info.plist` (replace the generated one, or point the target's
**Info.plist File** build setting at `FlashWatch Watch App/Info.plist`).

## 4. Create the complication (WidgetKit) extension

1. **File → New → Target… → watchOS → Widget Extension** → **Next**.
2. Product Name: **FlashWatchComplication**. Uncheck "Include Configuration
   App Intent" and "Include Live Activity". Embed in: **FlashWatch Watch App**.
   **Finish** → **Activate** the scheme if prompted.
3. **Delete** the generated starter widget `.swift` (Move to Trash).
4. Add these (already on disk in `ios/FlashWatchComplication/`) with **Target
   membership = FlashWatchComplication** only:
   - `FlashWatchComplicationBundle.swift`
   - `ComplicationProvider.swift`
   - `ComplicationViews.swift`
5. **Share the model + fetch code** with the complication: select
   `WatchStore.swift` and `PriceService.swift` (from `FlashWatch Watch App/`)
   and, in the File Inspector, **also tick `FlashWatchComplication`** under
   Target Membership. Both targets now compile the same snapshot/fetch logic.
6. Use the provided `Info.plist` for the extension (it declares the
   `widgetkit-extension` point).

## 5. App Group capability (both watch targets)

The App Group `group.com.lnflash.watch` is how the watch app and complication
share the price snapshot. **Do not** reuse the iOS `group.com.lnflash`.

1. Select **FlashWatch Watch App** target → **Signing & Capabilities → +
   Capability → App Groups** → add/tick `group.com.lnflash.watch`. Point its
   **Code Signing Entitlements** build setting at
   `FlashWatch Watch App/FlashWatch.entitlements` (provided).
2. Select **FlashWatchComplication** target → same: **+ Capability → App
   Groups** → tick `group.com.lnflash.watch`, and set **Code Signing
   Entitlements** to `FlashWatchComplication/FlashWatchComplication.entitlements`.
3. In the Apple Developer portal, create the App Group `group.com.lnflash.watch`
   and enable it on both watch App IDs (`com.lnflash.watchkitapp` and
   `com.lnflash.watchkitapp.FlashWatchComplication`). Automatic signing handles
   the profiles; regenerate manually-managed profiles if you use them.

> The phone-side `WatchConnectivityBridge` needs **no** App Group — it talks to
> the watch over WatchConnectivity, not shared storage.

## 6. Deployment target

Set both watch targets' **watchOS Deployment Target** to **9.0** or later
(WidgetKit accessory complications require watchOS 9). watchOS 10+ is fine.

## 7. Build & run

1. `cd ios && pod install` (keeps the workspace consistent; the watch targets
   need no pods).
2. Select the **FlashWatch Watch App** scheme + a paired watch
   simulator/device, build & run. You should see the live BTC price.
3. Add a complication: on the watch, long-press the face → **Edit** → pick a
   complication slot → choose **Flash**. Try the circular, rectangular, inline,
   and corner faces.
4. Currency sync: run the **LNFlash** app on the paired phone while logged in
   and change your display currency in Settings — `WatchCurrencySync` pushes it
   over, and the watch reprices on its next refresh.
5. Quick actions: tap **Scan** / **Receive** in the watch app. When the phone is
   reachable the bridge opens `flash://scan` / `flash://receive` on the phone.

## Notes

- **Self-refresh** uses the public unauthenticated `realtimePrice` query, so the
  watch and complication show a price even before login (USD until the phone
  pushes the user's currency). WidgetKit budgets watch refreshes; the
  complication asks for one roughly every 20 minutes.
- The `flash://scan` / `flash://receive` deep links resolve via the app's
  existing React Navigation `linking` config (`PREFIX_LINKING` already includes
  `flash://`). If a given screen route isn't registered, the action simply opens
  the app — no crash.
- Only the primary `com.lnflash` target gets the watch app. To attach it to
  `LNFlash-Alt`, repeat the embed + App Group wiring for that target.
