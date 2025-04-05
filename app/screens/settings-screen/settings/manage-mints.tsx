import * as React from "react"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { SettingsRow } from "../row"

export const ManageMintsSetting: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const navigateToManageMints = () => navigation.navigate("ManageMints")

  return (
    <SettingsRow
      title="Manage Pocket Money Mints"
      leftIcon="wallet-outline"
      rightIcon={null}
      action={navigateToManageMints}
    />
  )
}
