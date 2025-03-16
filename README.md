# Flash Mobile

<img src=".readme/flash-logo-transparent.png" alt="Flash Logo" width="300">

## Overview

This repository contains the Flash mobile application, a Bitcoin wallet app based on Galoy's backend infrastructure. Flash is designed to provide a seamless experience for Bitcoin and Lightning Network transactions, customizable for communities and organizations worldwide. The application is built with [React Native](https://reactnative.dev/) and runs on both iOS and Android.

## Features

- Bitcoin and Lightning Network transactions
- Multi-currency support
- QR code scanning for payments
- Contact management
- Secure authentication
- Customizable UI
- Push notifications
- NFC capabilities
- Multi-language support

## IBEX API Integration

Flash integrates with the IBEX Lightning Network infrastructure to provide reliable and fast Lightning payments. The integration allows users to:

- Send and receive Lightning payments using IBEX's liquidity network
- Access competitive Lightning routing fees
- Benefit from IBEX's high reliability and uptime
- Process Lightning transactions with minimal latency

The API connection is configured in the environment settings and authenticates securely using API keys. All communication with the IBEX API is encrypted and follows best security practices to protect user funds and transaction data.

For developers looking to modify the IBEX integration, relevant code can be found in the payment processing modules. Configuration details should be set in the appropriate environment variables as described in the development setup documentation.

## Breez SDK Integration

Flash leverages the Breez SDK (@breeztech/react-native-breez-sdk-liquid) to provide advanced Lightning Network functionality. The Breez SDK enables:

- Non-custodial Lightning payments with minimal setup
- Simplified Lightning node management
- Seamless integration with Liquid sidechain functionality
- Fast payment channels with automatic liquidity management
- Backup and recovery options for Lightning channels
- WebLN standard support for web application integration

The Breez SDK integration handles much of the complexity of Lightning Network operations behind the scenes, allowing users to focus on making transactions without worrying about technical details like channel management, routing, or liquidity.

Developers working with the Breez SDK integration should refer to the [official Breez SDK documentation](https://sdk-doc.breez.technology/) for detailed API references and implementation guidelines. Configuration parameters for the SDK can be found in the environment configuration files.

## Contributing

If you wish to contribute, please see [CONTRIBUTING.MD](./CONTRIBUTING.MD)

## Getting Started

### Prerequisites

- [Set up React Native development environment](https://reactnative.dev/docs/environment-setup) by following the instructions in the **React Native CLI Quickstart** tab
- Node.js and npm/yarn
- Xcode (for iOS development)
- Android Studio (for Android development)

### Installation

1. Clone the repository
   ```
   git clone https://github.com/YourOrganization/flash-mobile.git
   ```

2. Navigate to the project directory
   ```
   cd flash-mobile
   ```

3. Install dependencies
   ```
   yarn install
   ```

4. Start the Metro bundler
   ```
   yarn start
   ```

5. In another terminal window, run the app on iOS or Android
   ```
   yarn ios
   ```
   or
   ```
   yarn android
   ```

The app is built and pushed to the App Store and Play Store on demand with CircleCI.

### Development with Backend

To run the app fully locally, you'll need to set up the backend by following the instructions at https://github.com/GaloyMoney/galoy.

## Notes for Running on M1 Mac

The app currently only builds for x86_64 simulators. Simulators prior to iOS 13.7 are x86_64 by default, however starting with 13.7 they become platform specific. To get an x86_64 simulator of a newer iOS version, set XCode to open in [emulation using Rosetta](https://www.macworld.com/article/338843/how-to-force-a-native-m1-mac-app-to-run-as-an-intel-app-instead.html). 

To run the project:
1. Open [LNFlash.xcworkspace](./ios/LNFlash.xcworkspace/) in XCode
2. Choose an x86_64 simulator
3. Click the play button

This should start the Metro bundler in a new terminal and launch the simulator with the app.

## Running Storybook

1. From the command line in your app's root directory, enter `yarn storybook`
2. In `index.js`, change `SHOW_STORYBOOK` to `true` and reload the app

For Visual Studio Code users, install the `React Native Storybook` extension by `Orta`, press `cmd + shift + P`, and select "Reconnect Storybook to VSCode". Expand the STORYBOOK section in the sidebar to see all use cases for components that have `.story.tsx` files in their directories.

## E2E Testing

See the [E2E testing documentation](docs/e2e-testing.md) for details.

## Local Development with Libraries

The mobile app uses various client libraries for generic functions. To test changes to libraries locally:

1. Install [yalc](https://www.npmjs.com/package/yalc)
2. Run `npx yalc add @galoymoney/client` (or other library)
3. When finished, remove the yalc dependency using `npx yalc remove @galoymoney/client`

## Adding New Fonts

1. Add the new fonts to the `app/assets/fonts` directory
2. Run `yarn fonts` to link the font files to the native projects

## Adding Translation Keys

To add a new string for translation:
1. Navigate to [en/index.ts](app/i18n/en/index.ts) and add the phrase in English
2. Run `yarn update-translations`

**Warning**: Do not update files in the [raw translations folder](/app/i18n/raw-i18n/) as these files are managed programmatically.

## Icons

The app uses [react-native-vector-icons](https://github.com/oblador/react-native-vector-icons). Components from [react-native-elements](https://github.com/react-native-elements/react-native-elements) also use icons from this set. We've added custom icons from the Ionicons sets to existing components we import from the library.

**Warning**: If you import a new component from react-native-elements that uses an icon from a set other than Ionicons, it might not render properly.

## Debugging

You can use the React Native debugger with Chrome or the standalone [react-native-debugger](https://github.com/jhen0409/react-native-debugger) to set breakpoints. With that tool, you can view state using the included Apollo dev tools. 

For Android debugging, you may need to turn off Hermes in `android/gradle.properties` by setting `hermesEnabled=false`.

## License

This project is licensed under the [MIT License](LICENSE).
