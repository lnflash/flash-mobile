import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import AddressComponent from "./address-component"

export default {
  title: "Flash Address/AddressComponent",
  component: AddressComponent,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof AddressComponent>

export const LightningAddress = () => (
  <AddressComponent
    address="forge@flashapp.me"
    addressType="lightning"
    title="Flash Username"
    onToggleDescription={() => console.log("toggle")}
  />
)

export const PayCode = () => (
  <AddressComponent
    address="forge@flashapp.me"
    addressType="paycode"
    title="Pay Code"
    useGlobeIcon
    onToggleDescription={() => console.log("toggle")}
  />
)

export const PointOfSale = () => (
  <AddressComponent
    address="flash.me/pay/forge"
    addressType="pos"
    title="Point of Sale"
    onToggleDescription={() => console.log("toggle")}
  />
)
