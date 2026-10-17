import { PAIR_FOLDS, WORD_FOLDS } from "./folds"

// The grammar's first step (docs/ai-assistant-tool-registry.md §7.2): the
// utterance as words the rules can match. Each word is lower case, without
// the sentence punctuation around it, and folded: a common Jamaican patois
// or chat form becomes the English word the rules know ("mi" is "my", "wah"
// is "what", "sen" is "send"). The folds are data (folds.ts), so a reviewer
// of the patois corpus can read them in one place.
//
// A word without a digit also loses the apostrophes and hyphens inside it
// ("what's" is "whats", "on-chain" is "onchain"). A word with a digit keeps
// them: it is, or holds, an amount, and an amount is read only by
// readAmountPhrase (engine/amount-phrase.ts), from what was typed. "5-10" is
// two numbers and "-5" is no amount there, never "510" or "5" (decision 9).
// "&" and "+" on their own are "and", so "mom & dad" names two people, as
// "mom and dad" does.
//
// Each word keeps what was typed (`raw`), case and all. Names and memos are
// taken from that, never from a fold: a contact called "Fi" stays "fi". A
// word a comma ended says so (`comma`): "mom, dad" is a list of names, not
// one name.

export type Token = {
  /** As the rules match it: lower case, unpunctuated, folded. */
  word: string
  /** As typed, case kept, with the sentence punctuation around it trimmed. */
  raw: string
  /** A comma came right after it, as in "mom, dad": what follows is another item. */
  comma?: true
}

export type Utterance = { tokens: readonly Token[] }

export { PAIR_FOLDS, WORD_FOLDS } from "./folds"

/** Sentence punctuation that can lead a word: an opening quote or bracket. */
const LEADING = /^["'“‘([{¡¿]+/
/** Sentence punctuation that can end a word: a stop, a comma, a closing quote. */
const TRAILING = /["'”’)\]}?!.,;:…]+$/

/** Words that stand for "and" when they stand alone: "mom & dad", "bob + alice". */
const AND_SIGNS = new Set(["&", "+"])

const wordOf = (raw: string): string => {
  if (AND_SIGNS.has(raw)) return "and"
  const word = raw.toLowerCase().replace(/[’‘]/g, "'")
  // A word with a digit keeps its hyphens and apostrophes for
  // readAmountPhrase, which reads "5-10" as two numbers.
  return /\d/.test(word) ? word : word.replace(/['-]/g, "")
}

/** Whether a word is one the rules can match: it holds a letter, a digit or a currency sign. */
const isWord = (word: string): boolean => /[\p{L}\p{N}$₿]/u.test(word)

export const normalize = (utterance: string): Utterance => {
  const pieces: Token[] = []
  utterance.split(/\s+/).forEach((piece) => {
    const trimmed = piece.replace(LEADING, "")
    const raw = trimmed.replace(TRAILING, "")
    const comma = trimmed.slice(raw.length).includes(",")
    const word = wordOf(raw)
    if (isWord(word)) {
      pieces.push(comma ? { raw, word, comma } : { raw, word })
    } else if (comma && pieces.length > 0) {
      // A comma on its own ("mom , dad") ends the word before it.
      pieces[pieces.length - 1] = { ...pieces[pieces.length - 1], comma }
    }
  })

  const paired: Token[] = []
  for (let i = 0; i < pieces.length; i += 1) {
    const next = pieces[i + 1]
    // A comma between two words keeps them apart ("us, dollar").
    const pair =
      next && !pieces[i].comma ? PAIR_FOLDS[`${pieces[i].word} ${next.word}`] : undefined
    if (next && pair) {
      paired.push({
        word: pair,
        raw: `${pieces[i].raw} ${next.raw}`,
        ...(next.comma ? { comma: true as const } : {}),
      })
      i += 1
    } else {
      paired.push(pieces[i])
    }
  }

  return {
    tokens: paired.map((token) => ({
      ...token,
      word: Object.prototype.hasOwnProperty.call(WORD_FOLDS, token.word)
        ? WORD_FOLDS[token.word]
        : token.word,
    })),
  }
}

/** The words, as the rules match them, joined by single spaces. */
export const textOf = (tokens: readonly Token[]): string =>
  tokens.map(({ word }) => word).join(" ")
