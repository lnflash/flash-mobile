import React, { useState } from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import { PayCodeExplainerModal } from "./paycode-explainer-modal"

export default {
  title: "Flash Address/PayCodeExplainerModal",
  component: PayCodeExplainerModal,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof PayCodeExplainerModal>

export const Visible = () => {
  const [visible, setVisible] = useState(true)
  return <PayCodeExplainerModal modalVisible={visible} toggleModal={() => setVisible(false)} />
}
