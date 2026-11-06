/* Experimental candidate packet/relay engine. No Node, NFC, HTTP or storage
 * imports. Callers inject cryptography, an approved mint transport and durable
 * storage under a single-writer lease. No production capability is enabled. */
const FORMAT = "private-assisted-relay-v1";
const LIMIT = 32768;
class RelayFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const fail = (code) => {
  throw new RelayFailure(code);
};
const hex = (b) =>
  Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
const bytes = (value) => {
  if (
    typeof value !== "string" ||
    value.length > LIMIT * 2 ||
    !/^(?:[0-9a-f]{2})+$/.test(value)
  )
    fail("encoding");
  return value.match(/../g).map((v) => parseInt(v, 16));
};
const ascii = (s) => {
  const b = Array.from(s, (c) => c.charCodeAt(0));
  if (b.some((v) => v > 127)) fail("encoding");
  return b;
};
const snapshot = (v) => JSON.parse(JSON.stringify(v));
const sum = (values) => values.reduce((n, p) => n + p.amount, 0);
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function readPacket(raw, crypto) {
  if (
    !(Array.isArray(raw) || raw instanceof Uint8Array) ||
    raw.length > LIMIT ||
    Array.from(raw).some((v) => !Number.isInteger(v) || v < 0 || v > 255)
  )
    fail("encoding");
  const data = Array.from(raw);
  let at = 0;
  const take = (n) => {
    if (at + n > data.length) fail("truncated-packet");
    const v = data.slice(at, at + n);
    at += n;
    return v;
  };
  const number = (n) => take(n).reduce((v, b) => v * 256 + b, 0);
  const positive = (n) => {
    const v = number(n);
    if (!v) fail("zero-value");
    return v;
  };
  const point = () => {
    const p = take(33);
    if (![2, 3].includes(p[0]) || crypto.point(p) !== true) fail("point");
    return hex(p);
  };
  const keyset = () => {
    const n = number(1);
    if (n !== 8 && n !== 33) fail("keyset");
    return hex(take(n));
  };
  if (!eq(take(7), ascii("CCP-AS\x01"))) fail("format");
  const cardKey = point(),
    installation = hex(take(32));
  const paymentId = BigInt("0x" + hex(take(8))).toString(),
    index = number(1),
    generation = positive(4);
  if (paymentId === "0" || index >= 64 || number(1) !== 1) fail("profile");
  const mintLength = positive(2);
  if (mintLength > 214) fail("mint");
  const mintBytes = take(mintLength);
  if (mintBytes.some((v) => v <= 32 || v >= 127)) fail("mint");
  const mint = String.fromCharCode(...mintBytes),
    url = new URL(mint);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[?#@\\]/.test(mint)
  )
    fail("mint");
  if (number(1) !== 0) fail("unit");
  const inputCount = positive(1);
  if (inputCount > 128) fail("inputs");
  const inputs = [];
  for (let i = 0; i < inputCount; i++) {
    const slot = number(1),
      slotGeneration = positive(4),
      amount = positive(4),
      id = keyset(),
      nonce = hex(take(32)),
      C = point();
    if (slot >= 128) fail("slot");
    const secret = JSON.stringify([
      "P2PK",
      { nonce, data: cardKey, tags: [["sigflag", "SIG_ALL"]] },
    ]);
    inputs.push({
      slot,
      generation: slotGeneration,
      amount,
      id,
      nonce,
      secret,
      C,
    });
  }
  if (
    new Set(inputs.map((p) => p.slot)).size !== inputs.length ||
    new Set(inputs.map((p) => p.nonce)).size !== inputs.length
  )
    fail("duplicate-input");
  const outputCount = positive(1);
  if (outputCount > 128) fail("outputs");
  const outputs = [];
  for (let i = 0; i < outputCount; i++)
    outputs.push({ amount: positive(4), id: keyset(), B_: point() });
  if (
    new Set(outputs.map((o) => o.B_)).size !== outputs.length ||
    sum(outputs) > sum(inputs) ||
    sum(inputs) > 0xffffffff
  )
    fail("outputs");
  const payment = take(64),
    body = data.slice(0, at),
    descriptor = take(64);
  if (at !== data.length) fail("trailing-bytes");
  const transcript =
    inputs.map((p) => p.secret + p.C).join("") +
    outputs.map((o) => String(o.amount) + o.B_).join("");
  const paymentHash = crypto.hash(ascii(transcript));
  const tag = crypto.hash(ascii("CashuCard/assisted-settlement/v1"));
  const descriptorHash = crypto.hash([...tag, ...tag, ...body]);
  if (
    crypto.verify(payment, paymentHash, bytes(cardKey)) !== true ||
    crypto.verify(descriptor, descriptorHash, bytes(cardKey)) !== true
  )
    fail("signature");
  const packetId = hex(crypto.hash(body));
  const scope = [
    index,
    ...bytes(BigInt(paymentId).toString(16).padStart(16, "0")),
    ...bytes(generation.toString(16).padStart(8, "0")),
    ...bytes(packetId),
  ];
  return {
    cardKey,
    installation,
    paymentId,
    index,
    generation,
    mint,
    unit: "sat",
    inputs,
    outputs,
    witness: hex(payment),
    packetId,
    paymentMessage: hex(paymentHash),
    scope: hex(scope),
  };
}

function decodePacket(raw, policy, crypto) {
  const p = readPacket(raw, crypto);
  if (
    !policy ||
    p.mint !== policy.mint ||
    p.cardKey !== policy.cardKey ||
    p.installation !== policy.installation
  )
    fail("context");
  return p;
}

async function capturePacket({
  policy,
  crypto,
  readScope,
  readPage,
  save,
  journal: prior,
}) {
  const scope = Array.from(await readScope());
  if (
    scope.length !== 45 ||
    scope.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
  )
    fail("scope");
  const journal = prior
    ? snapshot(prior)
    : {
        format: FORMAT,
        state: "capturing",
        scope: hex(scope),
        pages: [],
      };
  if (
    journal.format !== FORMAT ||
    journal.state !== "capturing" ||
    journal.scope !== hex(scope) ||
    !Array.isArray(journal.pages) ||
    journal.pages.length > Math.ceil(LIMIT / 255)
  )
    fail("capture-scope");
  const packet = [];
  for (const page of journal.pages) {
    const data = bytes(page.data);
    if (
      page.offset !== packet.length ||
      data.length > 255 ||
      (page.receivedBytes !== undefined &&
        page.receivedBytes !== data.length) ||
      packet.length + data.length > LIMIT ||
      packet.length % 255 !== 0
    )
      fail("capture-pages");
    packet.push(...data);
  }
  const persist = () => save(snapshot(journal));
  await persist();
  for (;;) {
    let decoded;
    try {
      decoded = decodePacket(packet, policy, crypto);
    } catch (error) {
      if (error.code !== "truncated-packet") throw error;
      if (packet.length % 255 !== 0) fail("page");
    }
    if (decoded) {
      if (
        decoded.scope !== journal.scope ||
        !eq(scope, Array.from(await readScope()))
      )
        fail("scope");
      journal.packet = hex(packet);
      journal.state = "captured";
      delete journal.pending;
      await persist();
      return snapshot(journal);
    }
    if (packet.length >= LIMIT) fail("packet-limit");
    const offset = packet.length,
      count = Math.min(255, LIMIT - offset);
    journal.pending = { offset, count };
    await persist();
    const received = await readPage(offset, count);
    if (!(Array.isArray(received) || received instanceof Uint8Array))
      fail("page");
    const page = Array.from(received.slice(0, count));
    const valid = page.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
    journal.pages.push({
      offset,
      data: valid ? hex(page) : "",
      receivedBytes: received.length,
    });
    delete journal.pending;
    await persist();
    if (!page.length || received.length > count || !valid) fail("page");
    packet.push(...page);
  }
}

function completeRestore(p, response, keys, crypto) {
  if (
    !response ||
    !Array.isArray(response.outputs) ||
    !Array.isArray(response.signatures) ||
    response.outputs.length !== response.signatures.length
  )
    fail("restore-shape");
  if (response.outputs.length === 0) return null;
  if (response.outputs.length !== p.outputs.length) fail("restore-incomplete");
  const pairs = new Map();
  for (let i = 0; i < response.outputs.length; i++) {
    const got = response.outputs[i],
      sig = response.signatures[i],
      want = p.outputs.find((o) => o.B_ === got.B_);
    if (
      !want ||
      pairs.has(got.B_) ||
      got.id !== want.id ||
      got.amount !== want.amount ||
      sig.id !== want.id ||
      sig.amount !== want.amount ||
      !sig.dleq ||
      !keys[want.id]?.[String(want.amount)]
    )
      fail("restore-mismatch");
    let valid = false;
    try {
      valid =
        crypto.dleq(want, sig, keys[want.id][String(want.amount)]) === true;
    } catch {
      /* Invalid public evidence stays unresolved. */
    }
    if (!valid) fail("restore-signature");
    // Persist only the public fields used by the verifier.
    pairs.set(got.B_, {
      id: sig.id,
      amount: sig.amount,
      C_: sig.C_,
      dleq: { e: sig.dleq.e, s: sig.dleq.s },
    });
  }
  return p.outputs.map((o) => pairs.get(o.B_));
}

async function reconcilePayment({ journal, policy, crypto, request, save }) {
  const j = snapshot(journal);
  if (
    j.format !== FORMAT ||
    !["captured", "submitted", "pending", "outputs-confirmed"].includes(j.state)
  )
    fail("journal");
  const p = decodePacket(bytes(j.packet), policy, crypto);
  if (j.scope !== p.scope) fail("scope");
  const catalogue = await request("/v1/keysets");
  if (!Array.isArray(catalogue?.keysets)) fail("keysets");
  const sets = new Map();
  for (const k of catalogue.keysets) {
    if (sets.has(k.id)) fail("duplicate-keyset");
    sets.set(k.id, k);
  }
  let fees = 0;
  for (const input of p.inputs) {
    const k = sets.get(input.id);
    if (
      !k ||
      k.unit !== "sat" ||
      !Number.isSafeInteger(k.input_fee_ppk ?? 0) ||
      (k.input_fee_ppk ?? 0) < 0
    )
      fail("input-keyset");
    fees += k.input_fee_ppk ?? 0;
  }
  if (
    !Number.isSafeInteger(fees) ||
    sum(p.inputs) !== sum(p.outputs) + Math.ceil(fees / 1000)
  )
    fail("fee-policy");
  const keys = {};
  for (const id of new Set(p.outputs.map((o) => o.id))) {
    if (sets.get(id)?.unit !== "sat") fail("output-keyset");
    const r = await request("/v1/keys/" + id);
    if (
      !Array.isArray(r?.keysets) ||
      r.keysets.length !== 1 ||
      r.keysets[0].id !== id ||
      !r.keysets[0].keys
    )
      fail("output-keys");
    keys[id] = r.keysets[0].keys;
  }
  const persist = () => save(snapshot(j));
  const observe = async () => {
    const restore = await request("/v1/restore", { outputs: p.outputs });
    const signatures = completeRestore(p, restore, keys, crypto);
    const Ys = p.inputs.map((i) => crypto.proofY(i.secret));
    if (new Set(Ys).size !== Ys.length) fail("input-identities");
    const r = await request("/v1/checkstate", { Ys });
    if (!Array.isArray(r?.states) || r.states.length !== Ys.length)
      fail("input-states");
    const states = new Map();
    for (const s of r.states) {
      if (
        !Ys.includes(s.Y) ||
        states.has(s.Y) ||
        !["UNSPENT", "PENDING", "SPENT"].includes(s.state)
      )
        fail("input-states");
      states.set(s.Y, s.state);
    }
    return { signatures, states: [...states.values()] };
  };
  let observation = await observe();
  if (
    !observation.signatures &&
    observation.states.every((s) => s === "UNSPENT")
  ) {
    if (p.outputs.some((o) => sets.get(o.id).active !== true))
      fail("inactive-output-keyset");
    j.state = "submitted";
    delete j.evidence;
    await persist();
    const inputs = p.inputs.map(({ id, amount, secret, C }, i) => ({
      id,
      amount,
      secret,
      C,
      ...(i === 0
        ? { witness: JSON.stringify({ signatures: [p.witness] }) }
        : {}),
    }));
    try {
      await request("/v1/swap", { inputs, outputs: p.outputs });
    } catch {
      /* The exact attempt may have succeeded. Reconcile; never substitute outputs. */
    }
    observation = await observe();
  }
  if (
    observation.signatures &&
    observation.states.every((s) => s === "SPENT")
  ) {
    j.state = "outputs-confirmed";
    j.evidence = {
      packetId: p.packetId,
      outputs: p.outputs,
      signatures: observation.signatures,
      inputsSpent: true,
    };
    await persist();
    return snapshot(j);
  }
  if (
    !observation.signatures &&
    observation.states.some((s) => s === "PENDING")
  ) {
    j.state = "pending";
    delete j.evidence;
    await persist();
    return snapshot(j);
  }
  fail("settlement-unresolved");
}
module.exports = {
  decodePacket,
  capturePacket,
  reconcilePayment,
  RelayFailure,
};
