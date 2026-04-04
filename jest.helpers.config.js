/**
 * jest.helpers.config.js
 *
 * Minimal Jest config for pure-logic helper tests (no RN, no auto-mock transforms).
 * Avoids the ttypescript/TypeScript-5 incompatibility in the main jest.config.js.
 * Use: npx jest --config jest.helpers.config.js __tests__/card/
 */
module.exports = {
  preset: "react-native",
  transform: {
    "\\.(ts|tsx)$": "babel-jest",
    "^.+\\.svg$": "jest-transform-stub",
  },
  testRegex: "(/__tests__/.*\\.(test|spec))\\.(ts|tsx|js)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  rootDir: ".",
  moduleNameMapper: {
    "^@app/(.*)$": ["<rootDir>/app/$1"],
    "^@mocks/(.*)$": ["<rootDir>/__mocks__/$1"],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|@react-navigation|@rneui)/)",
  ],
}
