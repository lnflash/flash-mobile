import React, { useEffect, useState } from "react"
import { Image, Modal } from "react-native"
import * as Keychain from "react-native-keychain"

// components
import { AdvancedModeModal } from "./advanced-mode-modal"

// store
import { usePersistentStateContext } from "@app/store/persistent-state"

// utils
import { KEYCHAIN_MNEMONIC_KEY } from "@app/utils/breez-sdk-liquid"

type Props = {
  advanceModalVisible: boolean
  setAdvanceModalVisible: (isVisible: boolean) => void
}

export const QuickStartAdvancedMode: React.FC<Props> = ({
  advanceModalVisible,
  setAdvanceModalVisible,
}) => {
  const { updateState } = usePersistentStateContext()
  const [animationVisible, setAnimationVisible] = useState(false)
  const [hasRecoveryPhrase, setHasRecoveryPhrase] = useState(false)

  useEffect(() => {
    checkRecoveryPhrase()
  }, [])

  const checkRecoveryPhrase = async () => {
    const credentials = await Keychain.getInternetCredentials(KEYCHAIN_MNEMONIC_KEY)
    if (credentials) setHasRecoveryPhrase(true)
  }

  const onUpdateState = () => {
    updateState((state: any) => {
      if (state)
        return {
          ...state,
          isAdvanceMode: true,
        }
      return undefined
    })

    setAnimationVisible(true)
    setTimeout(() => {
      setAnimationVisible(false)
      if (hasRecoveryPhrase) {
        setAdvanceModalVisible(true)
      }
    }, 5500)
  }

  return (
    <>
      <Modal visible={animationVisible} animationType={"fade"}>
        <Image
          source={require("@app/assets/gifs/flash-logo-btc-enabled.gif")}
          style={{ height: "100%", width: "100%" }}
        />
      </Modal>
      <AdvancedModeModal
        hasRecoveryPhrase={hasRecoveryPhrase}
        isVisible={advanceModalVisible}
        setIsVisible={setAdvanceModalVisible}
        enableAdvancedMode={onUpdateState}
      />
    </>
  )
}
