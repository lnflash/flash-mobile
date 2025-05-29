import React, { useState, useEffect, useRef } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useI18nContext } from "@app/i18n/i18n-react"
import { Screen } from "@app/components/screen"
import { makeStyles, useTheme } from "@rneui/themed"
import QRCode from "react-native-qrcode-svg"
import { CashuService } from "@app/services/ecash/cashu-service"
import { BCURQRCode, BCUREncoder } from "@app/utils/qr/bcur"
import { GaloyIcon } from "@app/components/atomic/galoy-icon"
import Clipboard from "@react-native-clipboard/clipboard"

type Props = StackScreenProps<RootStackParamList, "SendECash">

const FRAGMENT_INTERVALS = [100, 250, 500, 1000] // milliseconds
const FRAGMENT_LENGTHS = [200, 400, 800] // bytes

export const SendECashScreen: React.FC<Props> = ({ navigation }) => {
  const { LL: _LL } = useI18nContext()
  const styles = useStyles()
  const { theme } = useTheme()

  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [qrValue, setQrValue] = useState<string>("")
  const [fragmentIntervalIndex, setFragmentIntervalIndex] = useState(1) // Start with 250ms
  const [fragmentLengthIndex, setFragmentLengthIndex] = useState(0) // Start with 200 bytes
  const [encoderInfo, setEncoderInfo] = useState<{
    currentIndex: number
    estimatedFragments: number
  } | null>(null)

  const encoderRef = useRef<BCUREncoder | null>(null)

  // Clean up encoder on unmount
  useEffect(() => {
    return () => {
      if (encoderRef.current) {
        encoderRef.current.stop()
      }
    }
  }, [])

  const handleGenerateToken = async () => {
    const amountNum = parseInt(amount, 10)

    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount greater than 0")
      return
    }

    setLoading(true)

    try {
      const cashuService = CashuService.getInstance()
      const result = await cashuService.sendToken(amountNum)

      if (result.success && result.token) {
        setToken(result.token)
        startQRCodeGeneration(result.token)
      } else {
        Alert.alert("Error", result.error || "Failed to generate token")
      }
    } catch (error) {
      console.error("Error generating token:", error)
      Alert.alert("Error", "An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const startQRCodeGeneration = (tokenString: string) => {
    // Stop any existing encoder
    if (encoderRef.current) {
      encoderRef.current.stop()
    }

    // Create new encoder with current settings
    const encoder = BCURQRCode.encodeToken(tokenString, {
      fragmentLength: FRAGMENT_LENGTHS[fragmentLengthIndex],
      fragmentInterval: FRAGMENT_INTERVALS[fragmentIntervalIndex],
    })

    encoderRef.current = encoder

    // Start the QR code loop
    encoder.start((fragment) => {
      setQrValue(fragment)
      setEncoderInfo(encoder.getInfo())
    })
  }

  const changeSpeed = (direction: "slower" | "faster") => {
    let newIndex = fragmentIntervalIndex

    if (direction === "slower" && fragmentIntervalIndex < FRAGMENT_INTERVALS.length - 1) {
      newIndex = fragmentIntervalIndex + 1
    } else if (direction === "faster" && fragmentIntervalIndex > 0) {
      newIndex = fragmentIntervalIndex - 1
    }

    if (newIndex !== fragmentIntervalIndex) {
      setFragmentIntervalIndex(newIndex)

      // Update the encoder if it's running
      if (encoderRef.current && token) {
        encoderRef.current.changeSpeed(FRAGMENT_INTERVALS[newIndex], (fragment) => {
          setQrValue(fragment)
          setEncoderInfo(encoderRef.current!.getInfo())
        })
      }
    }
  }

  const changeFragmentSize = () => {
    const newIndex = (fragmentLengthIndex + 1) % FRAGMENT_LENGTHS.length
    setFragmentLengthIndex(newIndex)

    // Restart QR generation with new fragment size
    if (token) {
      startQRCodeGeneration(token)
    }
  }

  const handleReset = () => {
    if (encoderRef.current) {
      encoderRef.current.stop()
    }
    setToken(null)
    setQrValue("")
    setAmount("")
    setEncoderInfo(null)
  }

  const copyToClipboard = async () => {
    if (token) {
      await Clipboard.setString(token)
      Alert.alert("Copied", "Token copied to clipboard")
    }
  }

  return (
    <Screen preset="scroll" style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <GaloyIcon name="arrow-left" size={24} color={theme.colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>Send eCash</Text>
        <View style={styles.placeholder} />
      </View>

      {token ? (
        <ScrollView style={styles.qrSection}>
          <View style={styles.qrContainer}>
            {qrValue && (
              <QRCode value={qrValue} size={300} backgroundColor="white" color="black" />
            )}
          </View>

          {encoderInfo && (
            <View style={styles.infoSection}>
              <Text style={styles.infoText}>
                Fragment {encoderInfo.currentIndex + 1} of ~
                {encoderInfo.estimatedFragments}
              </Text>
              <Text style={styles.speedText}>
                Speed: {FRAGMENT_INTERVALS[fragmentIntervalIndex]}ms
              </Text>
              <Text style={styles.sizeText}>
                Fragment size: {FRAGMENT_LENGTHS[fragmentLengthIndex]} bytes
              </Text>
            </View>
          )}

          <View style={styles.controls}>
            <View style={styles.speedControls}>
              <TouchableOpacity
                style={styles.speedButton}
                onPress={() => changeSpeed("slower")}
                disabled={fragmentIntervalIndex >= FRAGMENT_INTERVALS.length - 1}
              >
                <GaloyIcon name="payment-error" size={20} color={theme.colors.primary} />
                <Text style={styles.speedButtonText}>Slower</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.speedButton}
                onPress={() => changeSpeed("faster")}
                disabled={fragmentIntervalIndex <= 0}
              >
                <GaloyIcon
                  name="payment-success"
                  size={20}
                  color={theme.colors.primary}
                />
                <Text style={styles.speedButtonText}>Faster</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.sizeButton} onPress={changeFragmentSize}>
              <Text style={styles.sizeButtonText}>Change Fragment Size</Text>
            </TouchableOpacity>

            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard}>
                <GaloyIcon name="copy-paste" size={20} color={theme.colors.primary} />
                <Text style={styles.copyButtonText}>Copy Token</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                <Text style={styles.resetButtonText}>New Token</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.instructions}>
            <Text style={styles.instructionTitle}>Instructions:</Text>
            <Text style={styles.instructionText}>
              1. Have the recipient open their eCash wallet scanner
            </Text>
            <Text style={styles.instructionText}>
              2. They should scan this animated QR code
            </Text>
            <Text style={styles.instructionText}>
              3. The scanner will automatically piece together the fragments
            </Text>
            <Text style={styles.instructionText}>
              4. Adjust speed if scanning is difficult
            </Text>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.inputSection}>
          <Text style={styles.label}>Amount (sats)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="Enter amount"
            placeholderTextColor={theme.colors.grey3}
          />

          <TouchableOpacity
            style={[styles.generateButton, loading && styles.disabledButton]}
            onPress={handleGenerateToken}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <Text style={styles.generateButtonText}>Generate Token</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.grey5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey4,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.black,
  },
  placeholder: {
    width: 40,
  },
  inputSection: {
    padding: 20,
    backgroundColor: colors.white,
    margin: 16,
    borderRadius: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.black,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.grey4,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.black,
    marginBottom: 16,
  },
  generateButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.6,
  },
  generateButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  qrSection: {
    flex: 1,
  },
  qrContainer: {
    alignItems: "center",
    padding: 20,
    backgroundColor: colors.white,
    margin: 16,
    borderRadius: 12,
  },
  infoSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  infoText: {
    fontSize: 14,
    color: colors.grey1,
    marginBottom: 4,
  },
  speedText: {
    fontSize: 14,
    color: colors.grey1,
    marginBottom: 4,
  },
  sizeText: {
    fontSize: 14,
    color: colors.grey1,
  },
  controls: {
    paddingHorizontal: 16,
  },
  speedControls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginBottom: 16,
  },
  speedButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.grey5,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 8,
  },
  speedButtonText: {
    fontSize: 14,
    color: colors.primary,
  },
  sizeButton: {
    backgroundColor: colors.grey5,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  sizeButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "500",
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginBottom: 20,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.grey5,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  copyButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "500",
  },
  resetButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  resetButtonText: {
    fontSize: 14,
    color: colors.white,
    fontWeight: "500",
  },
  instructions: {
    backgroundColor: colors.white,
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.black,
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 14,
    color: colors.grey1,
    marginBottom: 8,
    paddingLeft: 8,
  },
}))
