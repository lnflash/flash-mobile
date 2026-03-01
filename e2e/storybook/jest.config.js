const { defaults: tsjPreset } = require("ts-jest/presets")

module.exports = {
  rootDir: "../..",
  testMatch: ["<rootDir>/e2e/storybook/**/*.test.ts"],
  testTimeout: 180000,
  maxWorkers: 1,
  globalSetup: "detox/runners/jest/globalSetup",
  globalTeardown: "detox/runners/jest/globalTeardown",
  reporters: [
    "default",
    [
      "detox/runners/jest/reporter",
      {
        "outputDir": "e2e/storybook/artifacts"
      }
    ]
  ],
  verbose: true,
  testEnvironment: "detox/runners/jest/testEnvironment",
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.jest.json",
      }
    ]
  },
  moduleNameMapper: {
    "^@app/(.*)$": ["<rootDir>/app/$1"]
  },
}
