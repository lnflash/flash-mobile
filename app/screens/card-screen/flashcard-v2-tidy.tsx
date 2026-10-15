import React, { useState } from "react"
import { ActivityIndicator, TouchableOpacity, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"

import { PrimaryBtn } from "@app/components/buttons"
import { PinPad } from "@app/components/card/PinPad"
import type { CashuCardState } from "@app/contexts/Flashcard"
import { useCardTidy } from "@app/hooks"
import { tidyProgressText } from "@app/hooks/use-card-tidy"
import { useI18nContext } from "@app/i18n/i18n-react"
import {
  CardError,
  PIN_MAX_LENGTH,
  isValidCardPin,
  triesLeft,
} from "@app/utils/cashu-card"
import { CardSpendError } from "@app/utils/cashu-card-spend"
import { TidyError, TidyRecord, TidyResult } from "@app/utils/cashu-card-topup"

type LLType = ReturnType<typeof useI18nContext>["LL"]

type Step =
  | { name: "idle" }
  | { name: "pin" }
  | { name: "working" }
  | { name: "notice"; text: string }

/**
 * The card tidy on the card screen (ENG-702): the offer an online read made
 * under the owner's grant ("Tidy card", "Not now"), the note when too few
 * slots are free for one, and the card's tidies still owed, each finished by
 * a tap. The PIN is asked for before the tap only where the card's no-PIN
 * allowance does not cover the tidy (Decision 1), or when the card asked for
 * it; it lives in this component's state only. While the tap runs, it says
 * where the tidy has got to and to keep holding the card (ENG-706).
 */
export const FlashcardV2Tidy: React.FC<{
  card: CashuCardState
  /** Formats an amount in the card's unit, as the screen does. */
  formatAmount: (amount: number) => string
}> = ({ card, formatAmount }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { offer, records, progress, notNow, tidy, dismiss } = useCardTidy(card)
  const [step, setStep] = useState<Step>({ name: "idle" })
  const [pinEntry, setPinEntry] = useState("")

  // `finishOnly`: Finish on a listed tidy, which never starts a new one.
  // Kept across a PIN the card asked for, so the retry is the same intent.
  const [finishOnly, setFinishOnly] = useState(false)

  const run = async (opts: { pin?: string; finishOnly?: boolean } = {}) => {
    const finishing = opts.finishOnly ?? false
    setFinishOnly(finishing)
    setStep({ name: "working" })
    try {
      const result = await tidy({ pin: opts.pin, finishOnly: finishing })
      setStep({ name: "notice", text: resultText(result, LL) })
    } catch (err) {
      if (err instanceof CardSpendError && err.reason === "pin-needed") {
        setPinEntry("")
        setStep({ name: "pin" })
        return
      }
      setStep({ name: "notice", text: failureText(err, LL) })
    }
  }

  const start = () => {
    if (offer?.kind === "offer" && offer.needsPin) {
      setPinEntry("")
      setFinishOnly(false)
      setStep({ name: "pin" })
    } else {
      run()
    }
  }

  const notice =
    step.name === "notice" ? (
      <View accessibilityLiveRegion="polite">
        <Text type="p2" style={styles.notice} testID="flashcard-v2-tidy-notice">
          {step.text}
        </Text>
      </View>
    ) : null

  // Outside the offer: Finish on a tidy still owed taps with no offer shown.
  // Only once the tap has reported a stage: before that the tidy is still
  // asking the mint, or waiting for the card, or ends with no tap at all, and
  // "Reading the card… Keep holding" would not be true. A spinner covers that
  // time on both paths: the offer button's own, and on Finish one in the
  // link's place. It goes when the tap settles; the notice replaces it.
  const working =
    step.name === "working" && progress ? (
      <View
        accessibilityLiveRegion="polite"
        style={styles.progress}
        testID="flashcard-v2-tidy-progress"
      >
        <Text type="p2">{tidyProgressText(progress, LL)}</Text>
        <Text type="p2" bold>
          {LL.FlashcardV2.tidyKeepHolding()}
        </Text>
      </View>
    ) : null

  if (step.name === "pin") {
    return (
      <View style={styles.box} testID="flashcard-v2-tidy-pin">
        <Text type="bl" bold>
          {LL.FlashcardV2.topUpPinTitle()}
        </Text>
        <Text type="h01" style={styles.pinEntry}>
          {"●".repeat(pinEntry.length)}
        </Text>
        <PinPad
          onDigit={(digit) =>
            setPinEntry((e) => (e.length < PIN_MAX_LENGTH ? e + digit : e))
          }
          onBackspace={() => setPinEntry((e) => e.slice(0, -1))}
          onClear={() => setPinEntry("")}
        />
        <PrimaryBtn
          label={LL.FlashcardV2.tidyOffer()}
          disabled={!isValidCardPin(pinEntry)}
          onPress={() => {
            // Out of this component's state once it is on its way to the card.
            const pin = pinEntry
            setPinEntry("")
            run({ pin, finishOnly })
          }}
          testID="flashcard-v2-tidy-pin-submit"
        />
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setStep({ name: "idle" })}
          testID="flashcard-v2-tidy-pin-cancel"
        >
          <Text type="p2" bold style={styles.secondary}>
            {LL.FlashcardV2.tidyNotNow()}
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <>
      {records.map((record) => (
        <UnfinishedTidy
          key={record.id}
          record={record}
          busy={step.name === "working"}
          onFinish={() => run({ finishOnly: true })}
          onDismiss={() => dismiss(record).catch(() => undefined)}
        />
      ))}
      {offer?.kind === "offer" && (
        <View style={styles.box} testID="flashcard-v2-tidy-offer">
          <Text type="bl" bold>
            {LL.FlashcardV2.tidyOffer()}
          </Text>
          <Text type="caption">
            {LL.FlashcardV2.tidyBody({ outputs: offer.outputs })}
          </Text>
          {offer.fee > 0 && (
            <Text type="caption" testID="flashcard-v2-tidy-fee">
              {LL.FlashcardV2.tidyFee({ fee: formatAmount(offer.fee) })}
            </Text>
          )}
          <View style={styles.actions}>
            <PrimaryBtn
              label={LL.FlashcardV2.tidyOffer()}
              loading={step.name === "working"}
              disabled={step.name === "working"}
              onPress={start}
              testID="flashcard-v2-tidy"
            />
            <TouchableOpacity
              accessibilityRole="button"
              onPress={notNow}
              disabled={step.name === "working"}
              testID="flashcard-v2-tidy-not-now"
            >
              <Text type="p2" bold style={styles.secondary}>
                {LL.FlashcardV2.tidyNotNow()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {offer?.kind === "slots-short" && (
        <Text type="caption" style={styles.notice} testID="flashcard-v2-tidy-slots-short">
          {LL.FlashcardV2.tidySlotsShort()}
        </Text>
      )}
      {working}
      {notice}
    </>
  )
}

const UnfinishedTidy: React.FC<{
  record: TidyRecord
  busy: boolean
  onFinish: () => void
  onDismiss: () => void
}> = ({ record, busy, onFinish, onDismiss }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  // Kept for a human: the mint will not swap what the card signed (another
  // payment spent its pieces first, or the mint refused the swap for good),
  // and nothing here can finish it.
  const stuck = record.state === "needs-card"
  return (
    <View style={styles.unfinished} testID="flashcard-v2-unfinished-tidy">
      <Text type="p2" style={styles.unfinishedText}>
        {stuck ? LL.FlashcardV2.tidyNeedsCard() : LL.FlashcardV2.tidyInProgress()}
      </Text>
      {stuck ? (
        // Off the screen, kept in the tidy archive for support.
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          onPress={onDismiss}
          testID="flashcard-v2-dismiss-tidy"
        >
          <Text type="p2" bold>
            {LL.FlashcardV2.topUpDismiss()}
          </Text>
        </TouchableOpacity>
      ) : busy ? (
        // The tap Finish started (a tidy still owed holds the offer back, so
        // no other tap runs beside it). Before it reports a stage the tidy is
        // asking the mint, with nothing else on screen to say it is under way.
        <ActivityIndicator color={colors.primary} testID="flashcard-v2-finishing-tidy" />
      ) : (
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          onPress={onFinish}
          testID="flashcard-v2-finish-tidy"
        >
          <Text type="p2" bold>
            {LL.FlashcardV2.topUpFinish()}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

/**
 * What a tidy tap that ran means. Only a thrown error is a failure: a tidy
 * the tap's own plan skipped, or a saved one the card never signed (dropped,
 * nothing burned), has nothing to try again.
 */
const resultText = (result: TidyResult, LL: LLType): string => {
  switch (result.status) {
    case "tidied":
      return LL.FlashcardV2.tidyDone()
    case "unfinished":
      return LL.FlashcardV2.tidyInProgress()
    case "skipped":
      return result.reason === "slots"
        ? LL.FlashcardV2.tidySlotsShort()
        : LL.FlashcardV2.tidyNothing()
    case "abandoned":
      return LL.FlashcardV2.tidyNothing()
  }
}

/**
 * What a tidy tap that failed means: a tidy no retry can finish (kept for
 * support), a wrong PIN with the tries left, or try again.
 */
const failureText = (err: unknown, LL: LLType): string => {
  if (err instanceof TidyError && err.reason === "needs-card") {
    return LL.FlashcardV2.tidyNeedsCard()
  }
  if (err instanceof CardError) {
    const tries = triesLeft(err.sw)
    if (tries !== undefined && tries > 0) return LL.FlashcardV2.wrongPin({ tries })
  }
  return LL.FlashcardV2.tidyFailed()
}

const useStyles = makeStyles(({ colors }) => ({
  box: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border01,
    backgroundColor: colors.layer,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 20,
    gap: 8,
  },
  // Stretched, as the other card screens' buttons are: PrimaryBtn has no
  // width of its own, so a centred row shrinks it to its label (a pill
  // narrower than "Tidy card").
  actions: {
    marginTop: 8,
    gap: 4,
  },
  secondary: {
    textAlign: "center",
    paddingVertical: 12,
  },
  pinEntry: {
    textAlign: "center",
    minHeight: 40,
  },
  progress: {
    marginHorizontal: 20,
    marginTop: 8,
    alignItems: "center",
    gap: 4,
  },
  notice: {
    marginHorizontal: 20,
    marginTop: 8,
    textAlign: "center",
  },
  unfinished: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.grey5,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  unfinishedText: {
    flex: 1,
  },
}))
