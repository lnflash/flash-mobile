const path = require("path")
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config")

const defaultConfig = getDefaultConfig(__dirname)

// core-js (pulled in by the on-device Storybook client) installs polyfills at
// module-evaluation time and expects its own internals to load in order. With
// inline requires those internals resolve lazily, after the polyfill has
// replaced the native method, so e.g. Array.prototype.slice ends up calling
// itself ("Maximum call stack size exceeded" on boot with SHOW_STORYBOOK).
// Keep core-js out of inlining; everything else stays inlined.
const coreJsFiles = () => {
  const fs = require("fs")
  const root = path.dirname(require.resolve("core-js/package.json"))
  const files = {}
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(".js")) files[full] = true
    }
  }
  walk(root)
  return files
}

// Node.js core module polyfills for React Native 0.74+
const nodeLibs = require("node-libs-react-native")

module.exports = mergeConfig(defaultConfig, {
  transformer: {
    ...defaultConfig.transformer,
    babelTransformerPath: require.resolve("react-native-svg-transformer"),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: { blockList: coreJsFiles() },
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
