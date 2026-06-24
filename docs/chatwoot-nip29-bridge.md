# NIP-29 ↔ Chatwoot Bridge — Implementation Plan

## Overview

Standalone Node.js service that mirrors a NIP-29 Nostr group chat into a Chatwoot inbox with two-way sync: Nostr group messages appear in Chatwoot, and Chatwoot agent replies are published back to the Nostr group as kind 9 events.

---

## Assumptions

These need to be verified or decided before/during implementation:

1. **Bridge key permissions** — The bridge has its own Nostr keypair. We assume it can be added as a group member (or admin) by an existing admin so it can publish kind 9 events. If the group relay enforces member-only writes, this is a hard prerequisite.
2. **Chatwoot instance is already running** — We assume a Chatwoot instance exists and is accessible. The API Channel inbox and webhook still need to be configured (see Prerequisites).
3. **Webhook is publicly reachable** — The bridge's `/webhook/chatwoot` endpoint must be reachable from the Chatwoot instance. How this is exposed (reverse proxy, port, etc.) is up to the server's existing setup.
4. **nostr-tools v2.x** — The app uses nostr-tools v2.23.3; the bridge code below targets that same API. Verify the server's installed version matches.
5. **In-memory store is acceptable initially** — Contact/conversation ID mappings are kept in memory. On restart, both are re-hydrated from Chatwoot: contacts via search by `identifier` (pubkey), conversations via `GET /contacts/{id}/conversations` filtered by `inbox_id`. No duplicates should be created on restart.
6. **One conversation per group member** — Each Nostr pubkey gets its own Chatwoot conversation. Agents see individual threads, not a single shared group feed. If a shared feed is preferred, the conversation model needs to change.
7. **Messages are plaintext** — NIP-29 kind 9 events are not encrypted. This is correct per the spec, but confirm the group relay isn't doing anything custom.
8. **No historical backfill needed** — The bridge starts live from the moment it runs (with a 60-second startup buffer). If historical messages need importing, the `since` filter must be adjusted.
9. **Chatwoot webhook payload shape** — The webhook handler assumes the standard Chatwoot `message_created` payload structure. Verify against the actual Chatwoot version running on the server, as payload fields have changed across versions.

---

## Source Group Details

- **Group ID:** `A9lScksyYAOWNxqR`
- **Relay:** `wss://groups.0xchat.com`
- **Message kind:** `9`
- **Group tag:** `["h", "A9lScksyYAOWNxqR"]`

---

## Architecture

```
Nostr Relay (groups.0xchat.com)
        |  kind 9 events
        v
  [ Bridge Service ]  <-- Node.js
        |
        |-- Chatwoot REST API --> upsert contacts + post messages
        |
        ^-- Chatwoot Webhook --> agent replies --> publish kind 9 back to relay
```

---

## Prerequisites

### Chatwoot

1. Create an **API Channel** inbox: Settings → Inboxes → Add Inbox → API
   - Note the `inbox_id`
   - Get the account-level **API Access Token** from profile settings

2. Add a **webhook**: Settings → Integrations → Webhooks → Add new webhook
   - URL: `https://<bridge-host>/webhook/chatwoot`
   - Subscribe to: **Message Created** only

### Nostr

Generate a keypair for the bridge and add its pubkey as a group member/admin:

```js
import { generateSecretKey, getPublicKey } from 'nostr-tools'
const sk = generateSecretKey()  // Uint8Array
const pk = getPublicKey(sk)
// convert sk to hex for storage: Buffer.from(sk).toString('hex')
```

---

## Project Setup

```bash
mkdir nip29-chatwoot-bridge && cd nip29-chatwoot-bridge
npm init -y
npm install nostr-tools ws express dotenv axios
```

`.env`:
```
CHATWOOT_BASE_URL=https://your-chatwoot-instance.com
CHATWOOT_API_TOKEN=your_account_api_token
CHATWOOT_ACCOUNT_ID=1
CHATWOOT_INBOX_ID=5
NOSTR_RELAY=wss://groups.0xchat.com
NOSTR_GROUP_ID=A9lScksyYAOWNxqR
NOSTR_BRIDGE_PRIVKEY=<hex secret key>
PORT=3000
```

---

## Implementation

### File structure

```
src/
  index.js      # entry point
  nostr.js      # relay subscription + publish
  chatwoot.js   # Chatwoot REST API wrapper
  store.js      # in-memory maps
  webhook.js    # Express route for Chatwoot webhook
```

---

### `src/store.js`

```js
const contacts = new Map()       // pubkey (hex) -> Chatwoot contact ID
const conversations = new Map()  // pubkey (hex) -> Chatwoot conversation ID
const nostrToChatwoot = new Map() // nostr event ID -> chatwoot message ID
const chatwootToNostr = new Map() // chatwoot message ID -> nostr event ID

module.exports = { contacts, conversations, nostrToChatwoot, chatwootToNostr }
```

---

### `src/chatwoot.js`

```js
const axios = require('axios')

const api = axios.create({
  baseURL: `${process.env.CHATWOOT_BASE_URL}/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}`,
  headers: { api_access_token: process.env.CHATWOOT_API_TOKEN }
})

async function findContact(pubkeyHex) {
  const res = await api.get(`/contacts/search`, {
    params: { q: pubkeyHex, include_contacts: true }
  })
  return res.data.payload.find(c => c.identifier === pubkeyHex) || null
}

async function createContact(pubkeyHex) {
  const res = await api.post(`/contacts`, {
    name: pubkeyHex.slice(0, 8) + '…',
    identifier: pubkeyHex,
  })
  return res.data
}

async function upsertContact(pubkeyHex, store) {
  if (store.contacts.has(pubkeyHex)) return store.contacts.get(pubkeyHex)
  let contact = await findContact(pubkeyHex)
  if (!contact) contact = await createContact(pubkeyHex)
  store.contacts.set(pubkeyHex, contact.id)
  return contact.id
}

async function upsertConversation(contactId, pubkeyHex, store) {
  if (store.conversations.has(pubkeyHex)) return store.conversations.get(pubkeyHex)

  // Look up existing conversations for this contact to avoid creating duplicates
  // on restart (in-memory store is empty after restart but Chatwoot still has the conversation).
  const existing = await api.get(`/contacts/${contactId}/conversations`)
  const inboxId = Number(process.env.CHATWOOT_INBOX_ID)
  const match = existing.data.payload.find(c => c.inbox_id === inboxId)
  if (match) {
    store.conversations.set(pubkeyHex, match.id)
    return match.id
  }

  const res = await api.post(`/conversations`, {
    inbox_id: inboxId,
    contact_id: contactId,
  })
  store.conversations.set(pubkeyHex, res.data.id)
  return res.data.id
}

async function postIncomingMessage(conversationId, text, nostrEventId, store) {
  const res = await api.post(`/conversations/${conversationId}/messages`, {
    content: text,
    message_type: 'incoming',
    private: false,
  })
  store.nostrToChatwoot.set(nostrEventId, res.data.id)
  store.chatwootToNostr.set(res.data.id, nostrEventId)
  return res.data.id
}

module.exports = { upsertContact, upsertConversation, postIncomingMessage }
```

---

### `src/nostr.js`

```js
const { SimplePool, finalizeEvent, getPublicKey } = require('nostr-tools')
const { hexToBytes } = require('nostr-tools/utils')

const relay = process.env.NOSTR_RELAY
const groupId = process.env.NOSTR_GROUP_ID
const privkey = hexToBytes(process.env.NOSTR_BRIDGE_PRIVKEY)
const pool = new SimplePool()

function subscribeToGroup(onMessage) {
  return pool.subscribeMany(
    [relay],
    [{ kinds: [9], '#h': [groupId], since: Math.floor(Date.now() / 1000) - 60 }],
    { onevent: onMessage }
  )
}

async function publishGroupMessage(text) {
  const event = finalizeEvent({
    kind: 9,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['h', groupId, relay]],
    content: text,
  }, privkey)
  await Promise.any(pool.publish([relay], event))
  return event.id
}

function getBridgePubkey() {
  return getPublicKey(privkey)
}

module.exports = { subscribeToGroup, publishGroupMessage, getBridgePubkey }
```

---

### `src/webhook.js`

```js
const express = require('express')
const { publishGroupMessage } = require('./nostr')
const store = require('./store')

const router = express.Router()

router.post('/webhook/chatwoot', async (req, res) => {
  res.sendStatus(200) // ack immediately

  const event = req.body
  if (event.event !== 'message_created') return
  if (event.message_type !== 'outgoing') return

  const chatwootMsgId = event.id
  if (store.chatwootToNostr.has(chatwootMsgId)) return // echo guard

  const text = event.content
  if (!text?.trim()) return

  try {
    const nostrEventId = await publishGroupMessage(text)
    store.chatwootToNostr.set(chatwootMsgId, nostrEventId)
    store.nostrToChatwoot.set(nostrEventId, chatwootMsgId)
  } catch (err) {
    console.error('[webhook] failed to publish to Nostr:', err)
  }
})

module.exports = router
```

---

### `src/index.js`

```js
require('dotenv').config()
const express = require('express')
const { subscribeToGroup, getBridgePubkey } = require('./nostr')
const { upsertContact, upsertConversation, postIncomingMessage } = require('./chatwoot')
const store = require('./store')
const webhookRouter = require('./webhook')

const app = express()
app.use(express.json())
app.use(webhookRouter)

const bridgePubkey = getBridgePubkey()

subscribeToGroup(async (event) => {
  if (event.pubkey === bridgePubkey) return          // ignore own messages
  if (store.nostrToChatwoot.has(event.id)) return    // deduplicate

  try {
    const contactId = await upsertContact(event.pubkey, store)
    const convId = await upsertConversation(contactId, event.pubkey, store)
    await postIncomingMessage(convId, event.content, event.id, store)
  } catch (err) {
    console.error('[nostr] failed to forward to Chatwoot:', err)
  }
})

app.listen(process.env.PORT || 3000)
```

---

## Echo loop guards

| Scenario | Guard |
|---|---|
| Bridge receives a Nostr message it just published | Skip if `event.pubkey === bridgePubkey` |
| Chatwoot webhook fires for a message the bridge created | Skip if `chatwootToNostr.has(chatwootMsgId)` |

---

## Known limitations

- **Contact names**: Uses truncated pubkey as display name. Can be improved by fetching kind 0 (profile metadata) from a read relay.
- **Reply threading**: NIP-29 replies include `["e", replyToId, relay, "reply"]` tags. Chatwoot has no native threading within a conversation, so reply context is lost. A `> quote` prepend could be added as a workaround.
- **In-memory store**: Restarting the bridge loses the ID mappings, but both `upsertContact` and `upsertConversation` re-query Chatwoot on cache miss before creating anything new, so restarts should not produce duplicate contacts or conversations.
