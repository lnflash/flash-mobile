const tsAutoMockTransformer = require("ts-auto-mock/transformer").default

module.exports = {
  name: "ts-auto-mock-transformer",
  version: 1,
  factory(tsCompiler, options) {
    return tsAutoMockTransformer(tsCompiler.program, options)
  },
}
