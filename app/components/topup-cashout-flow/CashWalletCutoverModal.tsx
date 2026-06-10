import React from "react"
import { useWindowDimensions, View } from "react-native"
import Modal from "react-native-modal"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { useI18nContext } from "@app/i18n/i18n-react"
import { PrimaryBtn } from "@app/components/buttons"
import DollarIllustration from "@app/assets/illustrations/dollar.svg"
import { usePersistentStateContext } from "@app/store/persistent-state"

const CashWalletCutoverModal = () => {
  const { LL } = useI18nContext()
  const styles = useStyles()
  const { width } = useWindowDimensions()
  const { colors } = useTheme().theme
  const { persistentState, updateState } = usePersistentStateContext()

  const visible = !persistentState.hasSeenCashWalletCutoverModal

  const dismiss = () => {
    updateState((state) => {
      if (!state) return state
      return { ...state, hasSeenCashWalletCutoverModal: true }
    })
  }

  const illustrationSize = Math.min(width * 0.35, 140)

  return (
    <Modal
      isVisible={visible}
      backdropOpacity={0.5}
      backdropColor={colors.black}
      backdropTransitionOutTiming={0}
      onBackdropPress={dismiss}
      onSwipeComplete={dismiss}
      swipeDirection={["down"]}
      style={styles.modal}
      useNativeDriverForBackdrop
    >
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.illustrationContainer}>
          <View style={styles.illustrationCircle}>
            <DollarIllustration width={illustrationSize} height={illustrationSize} />
          </View>
        </View>

        <Text type="h2" style={styles.title}>
          {LL.CashWalletCutover.title()}
        </Text>
        <Text type="p2" style={styles.body}>
          {LL.CashWalletCutover.body()}
        </Text>

        <View style={styles.buttonContainer}>
          <PrimaryBtn
            label={LL.CashWalletCutover.dismissButton()}
            onPress={dismiss}
          />
        </View>
      </View>
    </Modal>
  )
}

export default CashWalletCutoverModal

const useStyles = makeStyles(({ colors }) => ({
  modal: {
    justifyContent: "flex-end",
    margin: 0,
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.grey4,
    marginBottom: 20,
  },
  illustrationContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  illustrationCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.grey5,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    textAlign: "center",
    marginBottom: 12,
  },
  body: {
    textAlign: "center",
    paddingHorizontal: 8,
    marginBottom: 28,
  },
  buttonContainer: {
    width: "100%",
  },
}))
