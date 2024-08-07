import { ScrollView } from "react-native-gesture-handler"

import { Screen } from "@app/components/screen"
import { testProps } from "@app/utils/testProps"
import { Button, makeStyles } from "@rneui/themed"

// import { SettingsGroup } from "../group"
import { AccountDeleteContextProvider } from "./account-delete-context"
import { AccountBanner } from "./banner"
import { AccountId } from "./id"
import { DangerZoneSettings } from "./settings/danger-zone"
// import { UpgradeAccountLevelOne } from "./settings/upgrade"
import { UpgradeTrialAccount } from "./settings/upgrade-trial-account"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { View, Text } from "react-native"

export const AccountScreen: React.FC = () => {
  const styles = useStyles()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  return (
    <AccountDeleteContextProvider>
      <Screen keyboardShouldPersistTaps="handled">
        <ScrollView
          contentContainerStyle={styles.outer}
          {...testProps("account-screen-scroll-view")}
        >
          <AccountBanner />
          <AccountId />
          <UpgradeTrialAccount />
          {/* <SettingsGroup items={[UpgradeAccountLevelOne]} /> */}
          <DangerZoneSettings />
          <View style={styles.button}>
            <Button onPress={() => navigation.navigate("settings")}>
              <Text>Back to Settings</Text>
            </Button>
          </View>
        </ScrollView>
      </Screen>
    </AccountDeleteContextProvider>
  )
}

const useStyles = makeStyles(() => ({
  outer: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingBottom: 20,
    display: "flex",
    flexDirection: "column",
    rowGap: 12,
  },
  button: {
    marginTop: "25%",
  },
}))
