import { describeCorpus, tuningFor } from "./corpus-suite"

// The grammar's rules for getPrice (app/assistant/grammar/get-price.ts), over
// the tuning corpus's getPrice entries.
describeCorpus("the grammar on getPrice, over the tuning corpus", tuningFor("getPrice"))
