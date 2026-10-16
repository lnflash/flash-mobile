import { describeCorpus, tuningFor } from "./corpus-suite"

// The grammar's rules for getBalances (app/assistant/grammar/get-balances.ts), over
// the tuning corpus's getBalances entries.
describeCorpus(
  "the grammar on getBalances, over the tuning corpus",
  tuningFor("getBalances"),
)
