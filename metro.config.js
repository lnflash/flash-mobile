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
    // @cashu/cashu-ts v4 is ESM-only and declares no `main` — only package
    // `exports`. Without this Metro cannot resolve it at all (ENG-616).
    // (Metro's own option names, hence the camelcase exemptions.)
    // eslint-disable-next-line camelcase
    unstable_enablePackageExports: true,
    // With exports resolution on, packages that import `tslib` (Apollo and
    // friends) would pick tslib's ESM build, whose namespace comes up undefined
    // under Metro's interop ("Cannot read property '__extends' of undefined").
    // Preferring the require/react-native conditions keeps those on CJS.
    // cashu-ts is unaffected: its exports carry no `require` key, so it still
    // falls through to `default`, its ESM bundle. Same shape as flash-pos.
    // eslint-disable-next-line camelcase
    unstable_conditionNames: ["require", "react-native"],
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
