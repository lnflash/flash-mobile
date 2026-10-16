import { describeCorpus, tuningFor } from "./corpus-suite"

// The grammar's rules for prepareReceive (app/assistant/grammar/prepare-receive.ts), over
// the tuning corpus's prepareReceive entries.
describeCorpus(
  "the grammar on prepareReceive, over the tuning corpus",
  tuningFor("prepareReceive"),
)
