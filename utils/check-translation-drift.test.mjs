import test from 'node:test'
import assert from 'node:assert/strict'
import { findMissingKeys } from './check-translation-drift.js'

test('findMissingKeys detects nested missing keys', () => {
  const en = {
    home: { title: 'Welcome', cta: 'Start' },
    settings: { language: 'Language' },
  }
  const es = {
    home: { title: 'Bienvenido' },
    settings: {},
  }

  assert.deepEqual(findMissingKeys(en, es), ['home.cta', 'settings.language'])
})

test('findMissingKeys returns empty when complete', () => {
  const en = { wallet: { send: 'Send', receive: 'Receive' } }
  const fr = { wallet: { send: 'Envoyer', receive: 'Recevoir' } }

  assert.deepEqual(findMissingKeys(en, fr), [])
})
