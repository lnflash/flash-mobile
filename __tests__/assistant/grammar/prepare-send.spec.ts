import { describeCorpus, tuningFor } from "./corpus-suite"

// The grammar's rules for prepareSend (app/assistant/grammar/prepare-send.ts), over
// the tuning corpus's prepareSend entries.
describeCorpus(
  "the grammar on prepareSend, over the tuning corpus",
  tuningFor("prepareSend"),
)
