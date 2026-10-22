import type { TranslationFunctions } from "@app/i18n/i18n-types"
import { CONTACT_EMAIL_ADDRESS } from "@app/config/appinfo"
import type { HelpTopic } from "./first-use-help"
export const helpAnswerText = (LL: TranslationFunctions, topic: HelpTopic): string =>
  topic === "support"
    ? LL.AskFlashHelp.supportChat({ email: CONTACT_EMAIL_ADDRESS })
    : LL.AskFlashHelp[topic]()
