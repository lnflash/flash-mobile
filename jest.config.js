module.exports = {
  preset: "react-native",
  resolver: "<rootDir>/jest.resolver.js",
  setupFiles: [
    "<rootDir>/jest-ts-auto-mock-config.ts",
    "./node_modules/react-native-gesture-handler/jestSetup.js",
  ],
  setupFilesAfterEnv: ["@testing-library/jest-native/extend-expect"],
  transform: {
    "\\.(ts|tsx)$": [
      "ts-jest",
      {
        // Use the standard "typescript" compiler patched by ts-patch (see the
        // "prepare"/"postinstall" ts-patch step) rather than the deprecated
        // "ttypescript", which is incompatible with TypeScript 5.x. ts-patch
        // enables the ts-auto-mock transformer declared in tsconfig.jest.json.
        compiler: "typescript",
        tsconfig: "tsconfig.jest.json",
        // Report type errors as warnings instead of failing the whole suite.
        // Some app modules currently have cross-file type errors that are out
        // of scope for unit tests; warnOnly keeps the runner usable while still
        // surfacing them.
        diagnostics: { warnOnly: true },
      },
    ],
    "^.+\\.svg$": "jest-transform-stub",
  },
  testRegex: "(/__tests__/.*\\.(test|spec))\\.(ts|tsx|js)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "cjs", "mjs", "json", "node"],
  rootDir: ".",
  moduleNameMapper: {
    "^@env$": "<rootDir>__mocks__/env.js",
    "^@app/(.*)$": ["<rootDir>app/$1"],
    "^@mocks/(.*)$": ["<rootDir>__mocks__/$1"],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(react-native" +
      "|@react-native-community" +
      "|@react-native-firebase" +
      "|@react-native-firebase/auth" +
      "|@react-native" +
      "|@react-navigation" +
      "|react-native-animatable" +
      "|react-native-camera" +
      "|react-native-country-picker-modal" +
      "|react-native-error-boundary" +
      "|react-native-extended-stylesheet" +
      "|react-native-haptic-feedback" +
      "|react-native-keyboard-aware-scroll-view" +
      "|react-native-modal" +
      "|react-native-phone-number-input" +
      "|react-native-ratings" +
      "|react-native-reanimated" +
      "|react-native-linear-gradient" +
      "|react-native-root-siblings" +
      "|react-native-screens" +
      "|react-native-size-matters" +
      "|react-native-splash-screen" +
      "|react-native-toast-message" +
      "|react-native-vector-icons" +
      "|react-navigation-tabs" +
      "|@rneui" +
      "|rn-qr-generator" +
      "|react-native-image-crop-picker" +
      "|react-native-currency-picker" +
      "|react-native-status-bar-height" +
      "|react-native-auto-height-image" +
      "|react-native-nfc-manager" +
      "|@reduxjs/toolkit" +
      "|reselect" +
      "|immer" +
      "|redux" +
      "|redux-persist" +
      ")/)",
  ],
}
