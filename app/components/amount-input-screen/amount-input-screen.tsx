import * as React from "react"
import { WalletCurrency } from "@app/graphql/generated"
import { CurrencyInfo, useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useI18nContext } from "@app/i18n/i18n-react"
import { ConvertMoneyAmount } from "@app/screens/send-bitcoin-screen/payment-details"
import {
  DisplayCurrency,
  greaterThan,
  lessThan,
  MoneyAmount,
  moneyAmountIsWalletAmount,
  toSpendableBalance,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { AmountInputScreenUI, MaxChipState } from "./amount-input-screen-ui"
import {
  Key,
  NumberPadNumber,
  numberPadReducer,
  NumberPadReducerActionType,
  NumberPadReducerState,
} from "./number-pad-reducer"

export type MaxAmountButtonResult = {
  /**
   * The computed max, in the sending wallet's currency. Absent when the
   * computation declined to propose one — an unpriceable destination, say —
   * in which case `note` carries the reason and the pad is left alone.
   */
  amount?: MoneyAmount<WalletOrDisplayCurrency>
  /** Info-row note explaining the computation (fee reserved, no fee, cap). */
  note?: string
}

/**
 * Optional MAX chip on the balance header. The amount screen stays free of
 * payment knowledge — callers (the send flow) provide the computation; when
 * the prop is absent no chip renders.
 */
export type MaxAmountButton = {
  /** Grey the chip out (zero balance) — it stays visible but inert. */
  disabled?: boolean
  /** Compute the max sendable amount. Must resolve — never hang the tap. */
  compute: () => Promise<MaxAmountButtonResult | null>
}

export type AmountInputScreenProps = {
  goBack: () => void
  initialAmount?: MoneyAmount<WalletOrDisplayCurrency>
  setAmount?: (amount: MoneyAmount<WalletOrDisplayCurrency>) => void
  walletCurrency: WalletCurrency
  convertMoneyAmount: ConvertMoneyAmount
  maxAmount?: MoneyAmount<WalletOrDisplayCurrency>
  minAmount?: MoneyAmount<WalletOrDisplayCurrency>
  maxAmountButton?: MaxAmountButton
}

const formatNumberPadNumber = (numberPadNumber: NumberPadNumber) => {
  const { majorAmount, minorAmount, hasDecimal } = numberPadNumber

  if (!majorAmount && !minorAmount && !hasDecimal) {
    return ""
  }

  const formattedMajorAmount = Number(majorAmount).toLocaleString()

  if (hasDecimal) {
    return `${formattedMajorAmount}.${minorAmount}`
  }

  return formattedMajorAmount
}

const numberPadNumberToMoneyAmount = ({
  numberPadNumber,
  currency,
  currencyInfo,
}: {
  numberPadNumber: NumberPadNumber
  currency: WalletOrDisplayCurrency
  currencyInfo: Record<WalletOrDisplayCurrency, CurrencyInfo>
}): MoneyAmount<WalletOrDisplayCurrency> => {
  const { majorAmount, minorAmount } = numberPadNumber
  const { minorUnitToMajorUnitOffset, currencyCode } = currencyInfo[currency]

  const majorAmountInMinorUnit =
    Math.pow(10, minorUnitToMajorUnitOffset) * Number(majorAmount)

  // if minorUnitToMajorUnitOffset is 2, slice 234354 to 23
  const slicedMinorAmount = minorAmount.slice(0, minorUnitToMajorUnitOffset)
  // if minorAmount is 4 and minorUnitToMajorUnitOffset is 2, then missing zeros is 1
  const minorAmountMissingZeros = minorUnitToMajorUnitOffset - slicedMinorAmount.length

  const amount =
    majorAmountInMinorUnit + Number(minorAmount) * Math.pow(10, minorAmountMissingZeros)

  return {
    amount,
    currency,
    currencyCode,
  }
}

const moneyAmountToNumberPadReducerState = ({
  moneyAmount,
  currencyInfo,
}: {
  moneyAmount: MoneyAmount<WalletOrDisplayCurrency>
  currencyInfo: ReturnType<typeof useDisplayCurrency>["currencyInfo"]
}): NumberPadReducerState => {
  const amountString = moneyAmount.amount.toString()
  const { minorUnitToMajorUnitOffset, showFractionDigits } =
    currencyInfo[moneyAmount.currency]

  let numberPadNumber: NumberPadNumber

  if (amountString === "0") {
    numberPadNumber = {
      majorAmount: "",
      minorAmount: "",
      hasDecimal: false,
    }
  } else if (amountString.length <= minorUnitToMajorUnitOffset) {
    numberPadNumber = {
      majorAmount: "0",
      minorAmount: showFractionDigits
        ? amountString.padStart(minorUnitToMajorUnitOffset, "0")
        : "",
      hasDecimal: showFractionDigits,
    }
  } else {
    numberPadNumber = {
      majorAmount: amountString.slice(
        0,
        amountString.length - minorUnitToMajorUnitOffset,
      ),
      minorAmount: showFractionDigits
        ? amountString.slice(amountString.length - minorUnitToMajorUnitOffset)
        : "",
      hasDecimal: showFractionDigits && minorUnitToMajorUnitOffset > 0,
    }
  }

  return {
    numberPadNumber,
    numberOfDecimalsAllowed: showFractionDigits ? minorUnitToMajorUnitOffset : 0,
    currency: moneyAmount.currency,
  }
}

export const AmountInputScreen: React.FC<AmountInputScreenProps> = ({
  goBack,
  initialAmount,
  setAmount,
  walletCurrency,
  convertMoneyAmount,
  maxAmount,
  minAmount,
  maxAmountButton,
}) => {
  const {
    currencyInfo,
    getSecondaryAmountIfCurrencyIsDifferent,
    formatMoneyAmount,
    zeroDisplayAmount,
  } = useDisplayCurrency()

  const { LL } = useI18nContext()

  const [numberPadState, dispatchNumberPadAction] = useReducer(
    numberPadReducer,
    moneyAmountToNumberPadReducerState({
      moneyAmount: initialAmount || zeroDisplayAmount,
      currencyInfo,
    }),
  )

  const newPrimaryAmount = numberPadNumberToMoneyAmount({
    numberPadNumber: numberPadState.numberPadNumber,
    currency: numberPadState.currency,
    currencyInfo,
  })

  const secondaryNewAmount = getSecondaryAmountIfCurrencyIsDifferent({
    primaryAmount: newPrimaryAmount,
    walletAmount: convertMoneyAmount(newPrimaryAmount, walletCurrency),
    displayAmount: convertMoneyAmount(newPrimaryAmount, DisplayCurrency),
  })

  // MAX chip: solid ("active") from the moment the tap fills the amount until
  // the user edits it; the currency toggle keeps the same underlying amount so
  // it does not clear the state.
  const [appliedMax, setAppliedMax] = useState<{ note?: string } | null>(null)
  const [isComputingMax, setIsComputingMax] = useState(false)
  const maxComputeInFlight = useRef(false)
  // The fee fetch behind compute() can take seconds. Every user edit
  // (key press, clear, currency toggle) bumps this generation; a resolve
  // whose tap-time generation no longer matches is dropped so it can never
  // overwrite what the user did while it was in flight.
  const editGeneration = useRef(0)
  // Read the target currency at resolve time, not from the tap-time closure.
  const currencyRef = useRef(numberPadState.currency)
  useEffect(() => {
    currencyRef.current = numberPadState.currency
  }, [numberPadState.currency])

  const onKeyPress = (key: Key) => {
    editGeneration.current += 1
    setAppliedMax(null)
    dispatchNumberPadAction({
      action: NumberPadReducerActionType.HandleKeyPress,
      payload: {
        key,
      },
    })
  }

  const onClear = () => {
    editGeneration.current += 1
    setAppliedMax(null)
    dispatchNumberPadAction({
      action: NumberPadReducerActionType.ClearAmount,
    })
  }

  const setNumberPadAmount = useCallback(
    (amount: MoneyAmount<WalletOrDisplayCurrency>) => {
      dispatchNumberPadAction({
        action: NumberPadReducerActionType.SetAmount,
        payload: moneyAmountToNumberPadReducerState({
          moneyAmount: amount,
          currencyInfo,
        }),
      })
    },
    [currencyInfo],
  )

  const onToggleCurrency =
    secondaryNewAmount &&
    (() => {
      editGeneration.current += 1
      const toggledAmount = Math.round(secondaryNewAmount.amount)
      // A toggle normally keeps the same underlying amount, so the MAX chip
      // stays solid. But when the pad holds a sub-display-unit amount (the
      // wallet-units dust fill), rounding to the other currency CHANGES the
      // amount — up to double the computed max, or down to an empty pad.
      // A lossy toggle drops the MAX claim; a faithful one keeps it.
      const roundTrip = convertMoneyAmount(
        { ...secondaryNewAmount, amount: toggledAmount },
        newPrimaryAmount.currency,
      )
      if (roundTrip.amount !== newPrimaryAmount.amount) {
        setAppliedMax(null)
      }
      setNumberPadAmount({
        ...secondaryNewAmount,
        amount: toggledAmount,
      })
    })

  const onMaxPress =
    maxAmountButton && !maxAmountButton.disabled
      ? () => {
          if (maxComputeInFlight.current) {
            return
          }
          maxComputeInFlight.current = true
          setIsComputingMax(true)
          const generationAtTap = editGeneration.current
          maxAmountButton
            .compute()
            .then((result) => {
              if (!result) {
                return
              }
              // Explained-but-empty: nothing to fill, but the user still
              // needs to know why the chip did nothing.
              if (!result.amount) {
                if (editGeneration.current === generationAtTap) {
                  setAppliedMax({ note: result.note })
                }
                return
              }
              const resultAmount = result.amount
              // The user typed, cleared, or toggled currency while the fee
              // fetch was in flight — their edit wins; drop the stale max.
              if (editGeneration.current !== generationAtTap) {
                return
              }
              const converted = convertMoneyAmount(resultAmount, currencyRef.current)
              // The pad may hold a DIFFERENT currency than the wallet (e.g.
              // JMD display over a USD wallet). The send path converts the
              // pad amount BACK to wallet units and rounds, so a display
              // amount that merely floors here can still round-trip above
              // the computed max and overdraw (found on-device: $1.099346
              // spendable → J$ fill → $1.10 sent → IBEX rejects). Step the
              // filled amount down until its round-trip stays within max.
              let fillAmount = Math.floor(converted.amount)
              const roundTripsAboveMax = (amount: number) =>
                Math.round(
                  convertMoneyAmount({ ...converted, amount }, resultAmount.currency)
                    .amount,
                ) > resultAmount.amount
              while (fillAmount > 0 && roundTripsAboveMax(fillAmount)) {
                fillAmount -= 1
              }
              // A positive wallet-units max can still floor (or step) down to
              // zero display units — e.g. a dust BTC balance worth under one
              // display cent. Filling 0 would empty the pad under a solid MAX
              // chip and leave Set Amount ready to commit a zero amount. Fill
              // in wallet units instead: the pad switches currency (as the
              // toggle does) and shows the true max, which needs no display
              // round-trip — the computation already floors it to whole
              // wallet minor units.
              if (fillAmount === 0 && resultAmount.amount > 0) {
                setNumberPadAmount(resultAmount)
              } else {
                setNumberPadAmount({
                  ...converted,
                  amount: fillAmount,
                })
              }
              setAppliedMax({ note: result.note })
            })
            .catch(() => {
              // The computation is expected to resolve with a fallback; a
              // rejection must never crash or block the tap.
            })
            .finally(() => {
              maxComputeInFlight.current = false
              setIsComputingMax(false)
            })
        }
      : undefined

  let maxChipState: MaxChipState | undefined
  if (maxAmountButton) {
    if (maxAmountButton.disabled) {
      maxChipState = "disabled"
    } else if (isComputingMax) {
      maxChipState = "computing"
    } else {
      maxChipState = appliedMax ? "active" : "available"
    }
  }

  useEffect(() => {
    if (initialAmount) {
      // A new initial amount means the caller committed or replaced the
      // amount (e.g. Set Amount closed the modal and it reopened while this
      // component stayed mounted). Any applied-MAX chip state and any MAX
      // computation still in flight refer to the pre-commit amount — clear
      // the chip and invalidate late resolves so a stale max can neither
      // overwrite the committed amount nor claim it as the computed max.
      editGeneration.current += 1
      setAppliedMax(null)
      setNumberPadAmount(initialAmount)
    }
  }, [initialAmount, setNumberPadAmount])

  let errorMessage = ""
  const maxAmountInPrimaryCurrency =
    maxAmount && convertMoneyAmount(maxAmount, newPrimaryAmount.currency)
  const minAmountInPrimaryCurrency =
    minAmount && convertMoneyAmount(minAmount, newPrimaryAmount.currency)
  // Display-side max for the error string only (#690): a wallet-currency
  // maxAmount can carry fractional-cent residue (e.g. 109.9346 cents) that
  // round-to-nearest formatting overstates as "$1.10" — the exact amount the
  // validation below rejects. Floor wallet amounts to whole spendable minor
  // units BEFORE conversion so the message matches the displayed balance.
  // Validation deliberately keeps using the raw maxAmountInPrimaryCurrency.
  const displayMaxAmount =
    maxAmount &&
    convertMoneyAmount(
      moneyAmountIsWalletAmount(maxAmount) ? toSpendableBalance(maxAmount) : maxAmount,
      newPrimaryAmount.currency,
    )

  if (
    maxAmountInPrimaryCurrency &&
    displayMaxAmount &&
    greaterThan({
      value: convertMoneyAmount(newPrimaryAmount, maxAmountInPrimaryCurrency.currency),
      greaterThan: maxAmountInPrimaryCurrency,
    })
  ) {
    errorMessage = LL.AmountInputScreen.maxAmountExceeded({
      maxAmount: formatMoneyAmount({ moneyAmount: displayMaxAmount }),
    })
  } else if (
    minAmountInPrimaryCurrency &&
    lessThan({
      value: convertMoneyAmount(newPrimaryAmount, minAmountInPrimaryCurrency.currency),
      lessThan: minAmountInPrimaryCurrency,
    })
  ) {
    errorMessage = LL.AmountInputScreen.minAmountNotMet({
      minAmount: formatMoneyAmount({ moneyAmount: minAmountInPrimaryCurrency }),
    })
  }

  const primaryCurrencyInfo = currencyInfo[newPrimaryAmount.currency]
  const secondaryCurrencyInfo =
    secondaryNewAmount && currencyInfo[secondaryNewAmount.currency]

  return (
    <AmountInputScreenUI
      walletCurrency={walletCurrency}
      primaryCurrencyCode={primaryCurrencyInfo.currencyCode}
      primaryCurrencyFormattedAmount={formatNumberPadNumber(
        numberPadState.numberPadNumber,
      )}
      primaryCurrencySymbol={primaryCurrencyInfo.symbol}
      secondaryCurrencyCode={secondaryCurrencyInfo?.currencyCode}
      secondaryCurrencyFormattedAmount={
        secondaryNewAmount &&
        formatMoneyAmount({
          moneyAmount: secondaryNewAmount,
          noSuffix: true,
          noSymbol: true,
        })
      }
      secondaryCurrencySymbol={secondaryCurrencyInfo?.symbol}
      errorMessage={errorMessage}
      infoMessage={appliedMax?.note}
      onKeyPress={onKeyPress}
      onClearAmount={onClear}
      onToggleCurrency={onToggleCurrency}
      setAmountDisabled={Boolean(errorMessage)}
      maxChipState={maxChipState}
      onMaxPress={onMaxPress}
      onSetAmountPress={setAmount && (() => setAmount(newPrimaryAmount))}
      goBack={goBack}
    />
  )
}
