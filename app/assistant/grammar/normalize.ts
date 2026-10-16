import { PAIR_FOLDS, WORD_FOLDS } from "./folds"

// The grammar's first step (docs/ai-assistant-tool-registry.md §7.2): the
// utterance as words the rules can match. Each word is lower case, without
// the sentence punctuation around it or the apostrophes and hyphens inside
// it, and folded: a common Jamaican patois or chat form becomes the English
// word the rules know ("mi" is "my", "wah" is "what", "sen" is "send"). The
// folds are data (folds.ts), so a reviewer of the patois corpus can read
// them in one place.
//
// Each word keeps what was typed (`raw`), case and all. Names and memos are
// taken from that, never from a fold: a contact called "Fi" stays "fi".
// Amounts are not read here: a rule hands the words it takes for an amount
// to readAmountPhrase (engine/amount-phrase.ts), which alone says what they
// mean.

export type Token = {
  /** As the rules match it: lower case, unpunctuated, folded. */
  word: string
  /** As typed, case kept, with the sentence punctuation around it trimmed. */
  raw: string
}

export type Utterance = { tokens: readonly Token[] }

export { PAIR_FOLDS, WORD_FOLDS } from "./folds"

/** Sentence punctuation that can lead a word: an opening quote or bracket. */
const LEADING = /^["'“‘([{¡¿]+/
/** Sentence punctuation that can end a word: a stop, a comma, a closing quote. */
const TRAILING = /["'”’)\]}?!.,;:…]+$/

const wordOf = (raw: string): string =>
  raw.toLowerCase().replace(/[’‘]/g, "'").replace(/['-]/g, "")

export const normalize = (utterance: string): Utterance => {
  const pieces = utterance
    .split(/\s+/)
    .map((piece) => piece.replace(LEADING, "").replace(TRAILING, ""))
    .map((raw) => ({ raw, word: wordOf(raw) }))
    .filter(({ word }) => /[\p{L}\p{N}$₿]/u.test(word))

  const paired: Token[] = []
  for (let i = 0; i < pieces.length; i += 1) {
    const next = pieces[i + 1]
    const pair = next ? PAIR_FOLDS[`${pieces[i].word} ${next.word}`] : undefined
    if (next && pair) {
      paired.push({ word: pair, raw: `${pieces[i].raw} ${next.raw}` })
      i += 1
    } else {
      paired.push(pieces[i])
    }
  }

  return {
    tokens: paired.map(({ word, raw }) => ({
      word: Object.prototype.hasOwnProperty.call(WORD_FOLDS, word)
        ? WORD_FOLDS[word]
        : word,
      raw,
    })),
  }
}

/** The words, as the rules match them, joined by single spaces. */
export const textOf = (tokens: readonly Token[]): string =>
  tokens.map(({ word }) => word).join(" ")
