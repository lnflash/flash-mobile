/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const path = require("path")
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config")

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */

const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false,
      },
    }),
    babelTransformerPath: require.resolve("react-native-svg-transformer"),
    // Add this line to fix the asset registry issue
    assetRegistryPath: require.resolve("react-native/Libraries/Image/AssetRegistry"),
  },
  projectRoot: path.resolve(__dirname),
  resolver: {
    assetExts: ["bin", "txt", "jpg", "png", "json", "gif", "webp"].filter(
      (ext) => ext !== "svg",
    ),
    sourceExts: ["js", "jsx", "ts", "tsx", "json", "svg", "cjs"],
    extraNodeModules: {
      stream: path.resolve(__dirname, "node_modules/readable-stream"),
      zlib: path.resolve(__dirname, "node_modules/browserify-zlib"),
    },
  },
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config)
