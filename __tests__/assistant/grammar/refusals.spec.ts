import { describeCorpus } from "./corpus-suite"
import { grammarExpected } from "./corpus/entries"
import { TUNING } from "./corpus/tuning"

// What the grammar never makes a call of, over the tuning corpus: follow-ups
// and pronouns, invoices and addresses, two payees, times, other features,
// questions and chat (all misses), reads its rules do not cover (misses to
// the grammar, ENG-749), and amounts that are a question (a suffix, a "$"
// on a J$ account, a number in words past ninety-nine, no amount).
describeCorpus(
  "the grammar on what is no call, over the tuning corpus",
  TUNING.filter((entry) => typeof grammarExpected(entry) === "string"),
)
