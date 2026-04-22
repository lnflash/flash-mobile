const path = require("path")
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config")

const defaultConfig = getDefaultConfig(__dirname)

// Node.js core module polyfills for React Native 0.74+
const nodeLibs = require("node-libs-react-native")

module.exports = mergeConfig(defaultConfig, {
  transformer: {
    ...defaultConfig.transformer,
    babelTransformerPath: require.resolve("react-native-svg-transformer"),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    ...defaultConfig.resolver,
    assetExts: defaultConfig.resolver.assetExts.filter((ext) => ext !== "svg"),
    sourceExts: [...defaultConfig.resolver.sourceExts, "svg", "cjs", "json"],
    extraNodeModules: {
      ...nodeLibs,
      crypto: require.resolve("crypto-browserify"),
      stream: require.resolve("readable-stream"),
      buffer: require.resolve("buffer"),
      vm: require.resolve("vm-browserify"),
    },
  },
})
