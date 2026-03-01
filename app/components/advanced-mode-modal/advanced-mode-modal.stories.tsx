import React, { useState } from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { PersistentStateProvider } from "../../store/persistent-state"
import { GaloyPrimaryButton } from "../atomic/galoy-primary-button"
import { AdvancedModeModal } from "./advanced-mode-modal"

export default {
  title: "Modals/AdvancedModeModal",
  component: AdvancedModeModal,
  decorators: [
    (Story) => (
      <PersistentStateProvider>
        <StoryScreen>{Story()}</StoryScreen>
      </PersistentStateProvider>
    ),
  ],
} as Meta<typeof AdvancedModeModal>

export const WithRecoveryPhrase = () => {
  const [isVisible, setIsVisible] = useState(true)
  return (
    <>
      <AdvancedModeModal hasRecoveryPhrase={true} isVisible={isVisible} setIsVisible={setIsVisible} />
      <GaloyPrimaryButton title="Show Modal" onPress={() => setIsVisible(true)} />
    </>
  )
}

export const WithoutRecoveryPhrase = () => {
  const [isVisible, setIsVisible] = useState(true)
  return (
    <>
      <AdvancedModeModal hasRecoveryPhrase={false} isVisible={isVisible} setIsVisible={setIsVisible} />
      <GaloyPrimaryButton title="Show Modal" onPress={() => setIsVisible(true)} />
    </>
  )
}
