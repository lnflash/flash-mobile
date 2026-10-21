# iOS native voice-delivery acceptance

A separate Release simulator app compiles the production `ios/LNFlash/SpeechPack.swift`
and the actual `FlashSpeech` pod, including its compiled immutable manifest. It
bundles no voice assets and uses no Flash account, microphone or store signing.
Its bundle ID is `com.lnflash.voicedeliverycheck` and it has its own data container.

The default launch cancels a public HTTPS transfer after progress begins, retries
immediately, verifies all six installed files, checks backup exclusion, deletes
its pack, and downloads/verifies it again. All requests use normal URLSession,
TLS and ATS behavior. Production release configuration is unchanged.

Generate a fresh local project (requires Xcode, CocoaPods and the `xcodeproj` Ruby gem):

```sh
ruby scripts/voice-pack/delivery-check-ios/generate.rb /tmp/flash-ios-delivery-check
cd /tmp/flash-ios-delivery-check
pod install
xcodebuild -workspace FlashVoiceDeliveryCheck.xcworkspace \
  -scheme FlashVoiceDeliveryCheck -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/flash-ios-delivery-derived CODE_SIGNING_ALLOWED=NO build
```

Choose an existing available simulator explicitly; replace `SIMULATOR_ID` below:

```sh
xcrun simctl boot SIMULATOR_ID
xcrun simctl bootstatus SIMULATOR_ID -b
xcrun simctl install SIMULATOR_ID \
  /tmp/flash-ios-delivery-derived/Build/Products/Release-iphonesimulator/FlashVoiceDeliveryCheck.app
xcrun simctl launch SIMULATOR_ID com.lnflash.voicedeliverycheck
xcrun simctl get_app_container SIMULATOR_ID com.lnflash.voicedeliverycheck data
```

Read `Documents/delivery-check.json` in the returned container once it exists.
Check `passed: true`, both ready installations, six verified files and backup
exclusion. Timings include an independent verification after installation.

Then cold-launch against the installed pack:

```sh
xcrun simctl terminate SIMULATOR_ID com.lnflash.voicedeliverycheck
xcrun simctl launch SIMULATOR_ID com.lnflash.voicedeliverycheck --installed-check
```

Read `Documents/delivery-reload.json`. This mode creates a new downloader object,
checks persisted readiness and renders the fixed welcome fixture in all three
voices. It never calls `download` or creates a URLSession. The simulator's network
remains available: this is local-only synthesis acceptance, not a network-blocked
or complete Flash UI test. First PCM is not speaker latency; no audio is played.

A normal launch refuses to delete an already-installed pack implicitly. To repeat
the full online sequence, remove only this isolated test app and install it again.
The generated project/output must stay outside the repository. Keep existing
Metro processes, provisioner connections and physical devices unchanged.
