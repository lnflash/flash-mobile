const path = require("path")
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config")
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs")

const defaultConfig = getDefaultConfig(__dirname)

// core-js (pulled in by the on-device Storybook client) installs polyfills at
// module-evaluation time and expects its own internals to load in order. With
// inline requires those internals resolve lazily, after the polyfill has
// replaced the native method, so e.g. Array.prototype.slice ends up calling
// itself ("Maximum call stack size exceeded" on boot with SHOW_STORYBOOK).
// Keep core-js out of inlining; everything else stays inlined.
const coreJsFiles = () => {
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

// @cashu/cashu-ts v4 is ESM-only and declares no `main`, and so are the
// @noble/@scure v2 packages nested under it: Metro can reach them only through
// package `exports`. Switching exports resolution on for the whole app
// re-resolves hundreds of modules that already ship (breez-sdk-spark moves
// from lib/commonjs to lib/module, redux is bundled twice: flash-mobile#745),
// so it is on only for a request FOR a @cashu package or FROM a file inside
// one — which covers every nested dependency, and nothing the app already
// bundles.
const CASHU_PACKAGE = /[\\/]node_modules[\\/]@cashu[\\/]/
const isCashuRequest = (context, moduleName) =>
  moduleName.startsWith("@cashu/") || CASHU_PACKAGE.test(context.originModulePath)

const resolveRequest = (context, moduleName, platform) =>
  context.resolveRequest(
    isCashuRequest(context, moduleName)
      ? {
          ...context,
          // Metro's own option names, hence the camelcase exemptions.
          // eslint-disable-next-line camelcase
          unstable_enablePackageExports: true,
          // cashu-ts's exports carry only import/default, so it lands on its
          // ESM build either way; `require` first keeps anything it pulls
          // that also ships CJS on the CJS build, as the rest of the app is.
          // eslint-disable-next-line camelcase
          unstable_conditionNames: ["require", "react-native"],
        }
      : context,
    moduleName,
    platform,
  )

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
    resolveRequest,
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
