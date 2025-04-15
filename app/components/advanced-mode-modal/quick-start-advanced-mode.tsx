import React, { useState } from "react"
import { Image, Modal } from "react-native"

// components
import { AdvancedModeModal } from "./advanced-mode-modal"

// store
import { usePersistentStateContext } from "@app/store/persistent-state"

type Props = {
  hasRecoveryPhrase: boolean
  advanceModalVisible: boolean
  setAdvanceModalVisible: (isVisible: boolean) => void
}

export const QuickStartAdvancedMode: React.FC<Props> = ({
  hasRecoveryPhrase,
  advanceModalVisible,
  setAdvanceModalVisible,
}) => {
  const { updateState } = usePersistentStateContext()
  const [animationVisible, setAnimationVisible] = useState(false)

  const onUpdateState = () => {
    updateState((state: any) => {
      if (state)
        return {
          ...state,
          isAdvanceMode: true,
          btcWalletEnabled: true,
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
