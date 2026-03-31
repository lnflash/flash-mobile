#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function flattenKeys(obj, prefix = '') {
  const keys = []

  if (!isObject(obj)) return keys

  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (isObject(v)) {
      keys.push(...flattenKeys(v, key))
    } else {
      keys.push(key)
    }
  }

  return keys
}

function findMissingKeys(source, translation) {
  const sourceKeys = new Set(flattenKeys(source))
  const translationKeys = new Set(flattenKeys(translation))

  return [...sourceKeys].filter((key) => !translationKeys.has(key)).sort()
}

function checkTranslationDrift({
  sourcePath = path.join(process.cwd(), 'app/i18n/raw-i18n/source/en.json'),
  translationsDir = path.join(process.cwd(), 'app/i18n/raw-i18n/translations'),
} = {}) {
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
  const files = fs.readdirSync(translationsDir).filter((f) => f.endsWith('.json')).sort()

  const failures = []
  for (const file of files) {
    const lang = path.basename(file, '.json')
    const translation = JSON.parse(fs.readFileSync(path.join(translationsDir, file), 'utf8'))
    const missing = findMissingKeys(source, translation)

    if (missing.length > 0) {
      failures.push({ lang, missing })
    }
  }

  return failures
}

if (require.main === module) {
  const failures = checkTranslationDrift()

  if (failures.length > 0) {
    console.error('❌ Translation drift detected (missing keys from en.json):\n')

    for (const { lang, missing } of failures) {
      console.error(`- ${lang}: ${missing.length} missing key(s)`)
      missing.slice(0, 20).forEach((k) => console.error(`  • ${k}`))
      if (missing.length > 20) {
        console.error(`  ... and ${missing.length - 20} more`)
      }
      console.error('')
    }

    process.exit(1)
  }

  console.log('✅ No translation drift detected (all languages include en.json keys).')
}

module.exports = {
  flattenKeys,
  findMissingKeys,
  checkTranslationDrift,
}
