import React, { useState } from "react"
import { View } from "react-native"

import { MockedProvider } from "@apollo/client/testing"
import { Meta } from "@storybook/react"

import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import mocks from "../../graphql/mocks"
import { SetDefaultAccountModal, Props } from "./set-default-account-modal"
import { GaloyPrimaryButton } from "../atomic/galoy-primary-button"

const SetDefaultAccountModalWithToggle: React.FC<Props> = (props) => {
  const [isVisible, setIsVisible] = useState(true)
  const toggleModal = () => setIsVisible(!isVisible)
  return (
    <View>
      <SetDefaultAccountModal
        {...props}
        isVisible={isVisible}
        toggleModal={toggleModal}
      />
      <GaloyPrimaryButton title={"Open modal"} onPress={toggleModal} />
    </View>
  )
}

export default {
  title: "Set Default Account Modal",
  component: SetDefaultAccountModal,
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocks} cache={createCache()}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
} as Meta<typeof SetDefaultAccountModal>

export const Default = () => (
  <IsAuthedContextProvider value={true}>
    <SetDefaultAccountModalWithToggle
      isVisible={true}
      toggleModal={() => {}}
    />
  </IsAuthedContextProvider>
)
