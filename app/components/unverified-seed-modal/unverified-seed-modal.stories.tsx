import React, { useState } from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { GaloyPrimaryButton } from "../atomic/galoy-primary-button"
import { UnverifiedSeedModal } from "./unverified-seed-modal"

export default {
  title: "Modals/UnverifiedSeedModal",
  component: UnverifiedSeedModal,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof UnverifiedSeedModal>

export const Default = () => {
  const [isVisible, setIsVisible] = useState(true)
  return (
    <>
      <UnverifiedSeedModal isVisible={isVisible} setIsVisible={setIsVisible} />
      <GaloyPrimaryButton title="Show Modal" onPress={() => setIsVisible(true)} />
    </>
  )
}
