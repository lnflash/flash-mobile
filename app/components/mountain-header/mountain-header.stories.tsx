import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { MountainHeader } from "./mountain-header"

export default {
  title: "Components/MountainHeader",
  component: MountainHeader,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof MountainHeader>

export const Bitcoin = () => <MountainHeader amount="0.00088413" color="#F7931A" />
export const USD = () => <MountainHeader amount="$158.00" color="#22c55e" />
export const Zero = () => <MountainHeader amount="$0.00" color="#6b7280" />
