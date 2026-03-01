import React, { useState } from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import CodeInput from "./code-input"

export default {
  title: "Components/CodeInput",
  component: CodeInput,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof CodeInput>

export const Default = () => {
  const [error, setError] = useState<string | undefined>()
  return (
    <CodeInput
      header="Enter the 6-digit code sent to your phone"
      loading={false}
      errorMessage={error}
      setErrorMessage={setError}
      send={(code) => console.log("send code:", code)}
    />
  )
}

export const WithError = () => (
  <CodeInput
    header="Enter the 6-digit code"
    loading={false}
    errorMessage="Invalid code. Please try again."
    setErrorMessage={() => {}}
    send={(code) => console.log("send code:", code)}
  />
)

export const Loading = () => (
  <CodeInput
    header="Enter the 6-digit code"
    loading={true}
    errorMessage={undefined}
    setErrorMessage={() => {}}
    send={(code) => console.log("send code:", code)}
  />
)
