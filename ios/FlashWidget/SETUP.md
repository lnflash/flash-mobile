# Flash iOS Widget — Xcode setup

All source files are scaffolded. The remaining steps create the WidgetKit
extension target and wire the files into Xcode (these edit `project.pbxproj`, so
they're done in the GUI to avoid corrupting it). Do everything in
`ios/LNFlash.xcworkspace`, not the `.xcodeproj`.

## 1. Add the bridge files to the app target

The native module that pushes price data lives in the **main app** target.

1. In Xcode, right-click the `LNFlash` group → **Add Files to "LNFlash"…**
2. Select `ios/LNFlash/WidgetBridge.swift` and `ios/LNFlash/WidgetBridge.m`.
3. Ensure **Target membership = LNFlash** (the app), **not** the widget.
   - The project already has a bridging header (`LNFlash-Bridging-Header.h`,
     Swift 5.2), so no new-header prompt should appear. If it does, **Don't
     create** — the existing one is already configured.

## 2. Create the widget extension target

1. **File → New → Target… → Widget Extension** → **Next**.
2. Product Name: **FlashWidget**. Uncheck "Include Configuration Intent" and
   "Include Live Activity". Team: your usual signing team. **Finish**.
3. When asked to **Activate "FlashWidget" scheme?** → **Activate**.
4. Xcode generates a `FlashWidget/` folder with a starter `FlashWidget.swift`,
   `Assets.xcassets`, and `Info.plist`. **Delete** the generated
   `FlashWidget.swift` (Move to Trash) — we provide our own sources.

## 3. Add the scaffolded sources to the widget target

Add these files (already on disk in `ios/FlashWidget/`) with **Target
membership = FlashWidget** only:

- `FlashWidgetBundle.swift`
- `Provider.swift`
- `FlashWidgetEntryView.swift`
- `SharedStore.swift`
- `PriceService.swift`

Use the provided `Info.plist` (replace the generated one, or point the target's
**Info.plist File** build setting at `FlashWidget/Info.plist`). Keep the
generated `Assets.xcassets` (or add an `AccentColor`/icon as desired).

## 4. App Group capability (both targets)

The App Group `group.com.lnflash` is how the app and widget share the price.

1. Select the **LNFlash** target → **Signing & Capabilities**. The
   `LNFlash.entitlements` / `LNFlashDebug.entitlements` files already declare
   `group.com.lnflash`; confirm **App Groups** shows it checked. If the
   capability row is missing, click **+ Capability → App Groups** and tick
   `group.com.lnflash`.
2. Select the **FlashWidget** target → **Signing & Capabilities → + Capability →
   App Groups** → tick `group.com.lnflash`. Set its **Code Signing Entitlements**
   build setting to `FlashWidget/FlashWidget.entitlements` (provided).
3. In the Apple Developer portal, create the App Group `group.com.lnflash` and
   enable it on both App IDs (`com.lnflash` and the widget's
   `com.lnflash.FlashWidget`). Regenerate provisioning profiles if you manage
   them manually (automatic signing handles this for you).

## 5. Deployment target

Set the **FlashWidget** target's **iOS Deployment Target** to **15.1** (matches
the app). WidgetKit needs iOS 14+, so this is fine. The Podfile post-install
hook enforces 15.1 across pods and won't conflict — the widget target has no pod
dependencies.

## 6. Build & run

1. `cd ios && pod install` (regenerates the workspace; the widget target needs
   no new pods but this keeps the project consistent).
2. Select the **LNFlash** scheme, build & run on a device/simulator.
3. Long-press the home screen → **+** → search **Flash** → add the widget. Try
   all three sizes.
4. Open the app once while authed so it pushes your display-currency price; the
   widget will also self-refresh from `https://api.flashapp.me/graphql` every
   ~15 min even with the app closed.
5. Tap **Scan** / **Receive** on the medium/large widget — they deep-link via
   `flash://widget/scan` and `flash://widget/receive` into the app.

## Notes

- Self-refresh uses the public unauthenticated `realtimePrice` query, so the
  widget shows a price even before the user logs in (defaults to USD until the
  app writes the user's chosen currency).
- Only the primary `com.lnflash` target gets the widget (per the chosen scope).
  To add it to `LNFlash-Alt`, repeat step 4's App Group wiring for that target
  and add the widget extension to its embed phase.
