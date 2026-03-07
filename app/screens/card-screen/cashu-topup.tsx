/**
 * cashu-topup.tsx
 *
 * Cashu NFC card top-up screen (ENG-179).
 *
 * Flow:
 *   amount  → User enters USD amount to load
 *   pin     → User enters their card PIN (or sets one for blank cards)
 *   tapping → NFC: SELECT + GET_INFO + GET_PUBKEY
 *   minting → GQL: cashuCardProvision → proofs minted from user's USD wallet
 *   writing → NFC: (SET_PIN +) VERIFY_PIN + LOAD_PROOF × N
 *   success → Card is loaded, ready to spend
 *   error   → Retry or cancel
 */

import React, { useCallback, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { gql, useMutation } from "@apollo/client"
import { StackNavigationProp } from "@react-navigation/stack"
import { useNavigation } from "@react-navigation/native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { Screen } from "@app/components/screen"
import { useScanningQrCodeScreenQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { WalletCurrency } from "@app/graphql/generated"

import useCashuCard, { CashuCardError } from "../../nfc/useCashuCard"
import { toCardWriteProof } from "./cashu-topup.helpers"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// ─── GQL ───────────────────────────────────────────────────────────────────
// cashuCardProvision is defined in flash PR #296. Generated types pending
// backend deployment — using manual typing until codegen is re-run.

const CASHU_CARD_PROVISION = gql`
  mutation cashuCardProvision($input: CashuCardProvisionInput!) {
    cashuCardProvision(input: $input) {
      errors {
        __typename
        message
      }
      proofs {
        id
        amount
        secret
        C
      }
      cardPubkey
      totalAmountCents
    }
  }
`

interface CashuProofGql {
  id: string
  amount: number
  secret: string
  C: string
}

interface CashuCardProvisionPayload {
  errors: { __typename: string; message: string }[]
  proofs: CashuProofGql[]
  cardPubkey: string
  totalAmountCents: number
}

// ─── Types ─────────────────────────────────────────────────────────────────

type Step = "amount" | "pin" | "tapping" | "minting" | "writing" | "success" | "error"

type Props = {
  navigation: StackNavigationProp<RootStackParamList>
}

// ─── Component ─────────────────────────────────────────────────────────────

export const CashuTopup: React.FC = () => {
  const navigation = useNavigation<Props["navigation"]>()
  const { colors } = useTheme().theme
  const styles = useStyles()
  const isAuthed = useIsAuthed()

  const { data } = useScanningQrCodeScreenQuery({ skip: !isAuthed })
  const wallets = data?.me?.defaultAccount?.wallets
  const usdWallet = wallets?.find((w) => w.walletCurrency === WalletCurrency.Usd)

  const [step, setStep] = useState<Step>("amount")
  const [amountDisplay, setAmountDisplay] = useState("")
  const [pin, setPin] = useState("")
  const [progressMsg, setProgressMsg] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [successInfo, setSuccessInfo] = useState<{
    proofCount: number
    totalCents: number
  } | null>(null)

  const isTopUpRef = useRef(false)
  const card = useCashuCard()

  const [provisionMutation] = useMutation<{
    cashuCardProvision: CashuCardProvisionPayload
  }>(CASHU_CARD_PROVISION)

  // ─── Helpers ──────────────────────────────────────────────────────────

  const amountCents = (): number => {
    const v = parseFloat(amountDisplay)
    return isNaN(v) || v <= 0 ? 0 : Math.round(v * 100)
  }

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`

  // ─── Main top-up flow ─────────────────────────────────────────────────

  const runTopup = useCallback(
    async (pinValue: string) => {
      if (!usdWallet?.id) {
        Alert.alert("No USD wallet found")
        return
      }

      try {
        // Step: NFC — read card
        setStep("tapping")
        setProgressMsg("Hold card to phone…")
        await card.startSession()

        let cardPubkey: string
        let isBlank: boolean
        let availableSlots: number | undefined

        try {
          const { pubkey, info } = await card.readBlankCardPubkey()
          cardPubkey = pubkey
          isBlank = true
          isTopUpRef.current = false
          setProgressMsg(`Card ready · ${info.emptyCount} free slots`)
        } catch (err) {
          if (
            err instanceof CashuCardError &&
            err.message.includes("top-up flow")
          ) {
            isBlank = false
            isTopUpRef.current = true
            cardPubkey = await card.getPubkey()
            const info = await card.getInfo()
            if (info.emptyCount === 0) {
              throw new CashuCardError("Card is full — no empty slots")
            }
            availableSlots = info.emptyCount
            setProgressMsg(`Top-up · ${info.emptyCount} free slots`)
          } else {
            throw err
          }
        }

        // Step: Mint proofs via GQL
        setStep("minting")
        setProgressMsg("Minting proofs…")

        const result = await provisionMutation({
          variables: {
            input: {
              walletId: usdWallet.id,
              amountCents: amountCents(),
              cardPubkey,
              ...(availableSlots !== undefined && { availableSlots }),
            },
          },
        })

        const payload = result.data?.cashuCardProvision
        if (!payload) throw new Error("No response from server")
        if (payload.errors?.length > 0) throw new Error(payload.errors[0].message)
        if (!payload.proofs?.length) throw new Error("No proofs returned from mint")

        const { proofs, totalAmountCents } = payload

        // Step: Write proofs to card
        setStep("writing")
        setProgressMsg(`Writing ${proofs.length} proofs…`)

        const cardWriteProofs = proofs.map(toCardWriteProof)
        await card.writeProofs(cardWriteProofs, pinValue, isBlank)
        await card.cleanup()

        // Success
        setSuccessInfo({ proofCount: proofs.length, totalCents: totalAmountCents })
        setStep("success")
      } catch (err) {
        await card.cleanup()

        const msg = err instanceof Error ? err.message : "Unknown NFC error"
        if (msg.toLowerCase().includes("cancel")) {
          setStep("pin")
          return
        }
        setErrorMsg(msg)
        setStep("error")
      }
    },
    [card, provisionMutation, usdWallet, amountDisplay],
  )

  // ─── Actions ──────────────────────────────────────────────────────────

  const handleAmountNext = () => {
    if (amountCents() < 100) {
      Alert.alert("Minimum amount is $1.00")
      return
    }
    setStep("pin")
  }

  const handlePinNext = () => {
    if (pin.length < 4) {
      Alert.alert("PIN must be at least 4 digits")
      return
    }
    runTopup(pin)
  }

  const handleRetry = () => {
    setStep("amount")
    setAmountDisplay("")
    setPin("")
    setErrorMsg("")
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <Screen
      preset="scroll"
      keyboardOffset="navigationHeader"
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Amount */}
          {step === "amount" && (
            <View style={styles.section}>
              <Text type="h1" bold style={styles.title}>
                Top Up Flash Card
              </Text>
              <Text style={styles.subtitle}>
                How much would you like to load (USD)?
              </Text>
              <View style={styles.amountRow}>
                <Text type="h1" bold style={[styles.currency, { color: colors.primary }]}>
                  $
                </Text>
                <TextInput
                  style={[styles.amountInput, { color: colors.black }]}
                  value={amountDisplay}
                  onChangeText={setAmountDisplay}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.grey3}
                  maxLength={8}
                  autoFocus
                />
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleAmountNext}
              >
                <Text bold style={styles.primaryBtnText}>
                  Next →
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* PIN */}
          {step === "pin" && (
            <View style={styles.section}>
              <Text type="h1" bold style={styles.title}>
                Card PIN
              </Text>
              <Text style={styles.subtitle}>
                Loading {formatCents(amountCents())} onto your card.{"\n"}
                Enter your card PIN (4–8 digits). If this is a new card, you'll set the PIN now.
              </Text>
              <TextInput
                style={[styles.pinInput, { borderBottomColor: colors.primary, color: colors.black }]}
                value={pin}
                onChangeText={setPin}
                keyboardType="numeric"
                secureTextEntry
                placeholder="PIN"
                placeholderTextColor={colors.grey3}
                maxLength={8}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handlePinNext}
              >
                <Text bold style={styles.primaryBtnText}>
                  Tap Card →
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep("amount")}>
                <Text style={{ color: colors.grey3 }}>← Back</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* In-progress */}
          {(step === "tapping" || step === "minting" || step === "writing") && (
            <View style={styles.section}>
              <Text type="h1" bold style={styles.title}>
                {step === "tapping" ? "📡 Tap Card" : step === "minting" ? "⚙️  Minting" : "✍️  Writing"}
              </Text>
              <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
              <Text style={[styles.subtitle, { textAlign: "center" }]}>{progressMsg}</Text>
              {step === "tapping" && (
                <Text style={{ color: colors.grey3, textAlign: "center" }}>
                  Hold your Flash card near the top of the phone
                </Text>
              )}
            </View>
          )}

          {/* Success */}
          {step === "success" && successInfo && (
            <View style={styles.section}>
              <Text style={styles.emoji}>✅</Text>
              <Text type="h1" bold style={styles.title}>
                Card Loaded!
              </Text>
              <Text style={styles.subtitle}>
                {formatCents(successInfo.totalCents)} loaded across{" "}
                {successInfo.proofCount} denomination{successInfo.proofCount !== 1 ? "s" : ""}.
              </Text>
              <Text style={{ color: colors.grey3, textAlign: "center", marginBottom: 24 }}>
                Your card is ready for offline payments.
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={() => navigation.goBack()}
              >
                <Text bold style={styles.primaryBtnText}>
                  Done
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => {
                  setStep("amount")
                  setAmountDisplay("")
                  setPin("")
                  setSuccessInfo(null)
                }}
              >
                <Text style={{ color: colors.grey3 }}>Top Up Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Error */}
          {step === "error" && (
            <View style={styles.section}>
              <Text style={styles.emoji}>❌</Text>
              <Text type="h1" bold style={styles.title}>
                Top-Up Failed
              </Text>
              <Text style={[styles.subtitle, { color: colors.error }]}>{errorMsg}</Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleRetry}
              >
                <Text bold style={styles.primaryBtnText}>
                  Try Again
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
                <Text style={{ color: colors.grey3 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const useStyles = makeStyles(({ colors }) => ({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    paddingHorizontal: 0,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  section: {
    alignItems: "center",
  },
  title: {
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    color: colors.grey2,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 32,
  },
  currency: {
    fontSize: 36,
    marginRight: 4,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: "700",
    minWidth: 120,
    textAlign: "center",
  },
  pinInput: {
    fontSize: 32,
    fontWeight: "700",
    borderBottomWidth: 2,
    width: 200,
    textAlign: "center",
    marginBottom: 32,
    paddingBottom: 8,
    letterSpacing: 12,
  },
  spinner: {
    marginVertical: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    marginTop: 8,
    width: "100%",
    alignItems: "center",
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 17,
  },
  secondaryBtn: {
    paddingVertical: 14,
    marginTop: 4,
    alignItems: "center",
  },
}))
