import React, { useState } from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../../.storybook/views"
import { store } from "../../store/redux"
import { GaloyPrimaryButton } from "../atomic/galoy-primary-button"
import AccountCreateModal from "./AccountCreateModal"

export default {
  title: "Home Screen/AccountCreateModal",
  component: AccountCreateModal,
  decorators: [(Story) => <Provider store={store}><StoryScreen>{Story()}</StoryScreen></Provider>],
} as Meta<typeof AccountCreateModal>

export const Default = () => {
  const [visible, setVisible] = useState(true)
  return (
    <>
      <AccountCreateModal modalVisible={visible} setModalVisible={setVisible} />
      <GaloyPrimaryButton title="Show Modal" onPress={() => setVisible(true)} />
    </>
  )
}
