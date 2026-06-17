// Custom jest resolver.
//
// @reduxjs/toolkit v2 exposes a "react-native" export condition that the
// react-native jest preset selects, resolving the package to an ESM bundle.
// Jest's runtime cannot evaluate ESM here, so we force @reduxjs/toolkit (and its
// react entry) to resolve through the CommonJS ("require"/"default") condition.
// Everything else is delegated to jest's default resolver unchanged.
const FORCE_CJS_CONDITIONS = new Set([
  "@reduxjs/toolkit",
  "@reduxjs/toolkit/react",
  "react-redux",
  "uuid",
])

module.exports = (request, options) => {
  if (FORCE_CJS_CONDITIONS.has(request)) {
    return options.defaultResolver(request, {
      ...options,
      conditions: ["require", "default"],
    })
  }
  return options.defaultResolver(request, options)
}
