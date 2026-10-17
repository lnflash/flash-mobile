// The import scan the module-boundary spec and the held-out isolation spec
// share: which modules a source file names, and whether one of them
// resolves into a directory or file. Not a spec itself.
import * as fs from "fs"
import * as path from "path"

export const repoDir = path.join(__dirname, "../..")
export const appDir = path.join(repoDir, "app")

/** Every module an import, export-from or require in `source` names. */
export const specifiers = (source: string): string[] => {
  const found: string[] = []
  const pattern =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm
  let match = pattern.exec(source)
  while (match) {
    found.push(match[1])
    match = pattern.exec(source)
  }
  return found
}

/**
 * Where `specifier`, imported from `file`, points on disk, without its
 * extension: "@app/x" is app/x, a relative path resolves from the file's
 * directory, and anything else (a package) is undefined.
 */
export const resolveSpecifier = (file: string, specifier: string): string | undefined => {
  if (specifier === "@app" || specifier.startsWith("@app/")) {
    return path.join(appDir, specifier.slice("@app/".length))
  }
  if (specifier.startsWith(".")) return path.resolve(path.dirname(file), specifier)
  return undefined
}

/** Every .ts and .tsx file under `dir`, as absolute paths. */
export const sourcesUnder = (dir: string): string[] =>
  fs
    .readdirSync(dir, { encoding: "utf8", recursive: true })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => path.join(dir, file))
