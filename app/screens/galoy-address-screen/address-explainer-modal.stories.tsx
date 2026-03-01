import React, { useState } from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import { AddressExplainerModal } from "./address-explainer-modal"

export default {
  title: "Flash Address/AddressExplainerModal",
  component: AddressExplainerModal,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof AddressExplainerModal>

export const Visible = () => {
  const [visible, setVisible] = useState(true)
  return <AddressExplainerModal modalVisible={visible} toggleModal={() => setVisible(false)} />
}
export const Hidden = () => <AddressExplainerModal modalVisible={false} />
