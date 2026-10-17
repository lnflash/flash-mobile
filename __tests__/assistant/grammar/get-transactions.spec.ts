import { describeCorpus, tuningFor } from "./corpus-suite"

// The grammar's rules for getTransactions (app/assistant/grammar/get-transactions.ts), over
// the tuning corpus's getTransactions entries.
describeCorpus(
  "the grammar on getTransactions, over the tuning corpus",
  tuningFor("getTransactions"),
)
