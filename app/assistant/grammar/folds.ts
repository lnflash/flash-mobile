// The grammar's folds (normalize.ts): Jamaican patois and chat forms, each
// read as the English word the rules match. Data only, kept apart so a
// reviewer of the patois corpus reads them in one place. The spell check
// (typos.toml) skips this file: patois is not misspelled English, and the
// misspellings below are folded on purpose.

/**
 * Jamaican patois and chat forms, each folded into the English word the
 * rules match. A fold applies to a whole word only.
 */
export const WORD_FOLDS: Readonly<Record<string, string>> = {
  // Jamaican patois.
  mi: "my", // "mi balance"; the rules read "my" and "me" alike
  wah: "what",
  wha: "what",
  weh: "what", // "di money weh mi sen": the money that I sent
  sen: "send",
  gi: "give",
  fi: "to", // "sen 500 fi mom"
  fa: "for", // "wah bitcoin a sell fa"
  di: "the",
  inna: "in",
  ina: "in",
  pon: "on",
  deh: "there",
  dem: "them",
  har: "her",
  yuh: "you",
  yu: "you",
  wan: "want",
  waan: "want",
  lef: "left",
  mek: "make",
  tek: "take",
  ting: "thing",
  anyting: "anything",
  sumting: "something",
  seh: "say",
  cyaan: "cant",
  dolla: "dollar",
  dollaz: "dollars",
  // Chat forms and common misspellings.
  u: "you",
  ur: "your",
  pls: "please",
  plz: "please",
  thx: "thanks",
  ty: "thanks",
  whats: "what",
  // "wat" and "wut" drop the "h" from "what" as chat and patois type it
  // ("wat di bitcoin price", "wut is my balance"; ENG-753), and "wats" and
  // "wuts" are their "whats". None is a common name, a currency or a
  // payee word, and a contact called one still keeps its spelling as typed
  // (Token.raw, normalize.ts); isQuestionAboutWhat reads "wats" and "wuts"
  // as it reads "whats".
  wat: "what",
  wut: "what",
  wats: "what",
  wuts: "what",
  hows: "how",
  wheres: "where",
  ive: "i",
  id: "i", // "i'd like to"
  bal: "balance",
  acct: "account",
  txn: "transactions",
  txns: "transactions",
  tx: "transactions",
  txs: "transactions",
  xfer: "transfer",
  recieve: "receive",
  recive: "receive",
  bitcoins: "bitcoin",
  // Dropped-vowel and chat forms of words the rules read, added after the
  // 0.9.0 dogfood (ENG-753): each folds to a word a rule already matches,
  // none is a common name, a currency or a payee word, and a contact called
  // one still keeps its spelling as typed (Token.raw, normalize.ts).
  // Typos of rule words:
  waht: "what",
  whhat: "what",
  hwo: "how",
  shwo: "show",
  shw: "show",
  snd: "send",
  paymnt: "payment",
  paymet: "payment",
  histroy: "history",
  histry: "history",
  histoy: "history",
  ballance: "balance",
  ballence: "balance",
  blance: "balance",
  balence: "balance",
  acount: "account",
  accont: "account",
  adress: "address",
  addres: "address",
  invioce: "invoice",
  invocie: "invoice",
  convertion: "conversion",
  lightining: "lightning",
  tranasctions: "transactions",
  transation: "transaction",
  transactons: "transactions",
  transacions: "transactions",
  walllet: "wallet",
  // Elongated chat forms:
  plss: "please",
  plsss: "please",
  thankss: "thanks",
  // Patois and chat verbs the rules read:
  gimme: "give",
  lemme: "let",
  av: "have",
  // "howmuch mi have": the pair fold below reads it as "how much".
  // Plural of the price noun:
  prices: "price",
}

/** Two-word forms folded into one word. */
export const PAIR_FOLDS: Readonly<Record<string, string>> = {
  "us dollar": "usd",
  "us dollars": "usd",
  "jamaican dollar": "jmd",
  "jamaican dollars": "jmd",
  "jamaica dollars": "jmd",
  "on chain": "onchain",
  "bit coin": "bitcoin",
}
