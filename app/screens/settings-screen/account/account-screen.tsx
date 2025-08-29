import { View } from "react-native"
import { makeStyles } from "@rneui/themed"

// components
import { AccountId } from "./id"
import { AccountBanner } from "./banner"
import { Screen } from "@app/components/screen"
import { DangerZoneSettings } from "./settings/danger-zone"
import { AccountDeleteContextProvider } from "./account-delete-context"
import { UpgradeTrialAccount } from "./settings/upgrade-trial-account"

// type
import { testProps } from "@app/utils/testProps"

export const AccountScreen: React.FC = () => {
  const styles = useStyles()

  return (
    <AccountDeleteContextProvider>
      <Screen keyboardShouldPersistTaps="handled">
        <View style={styles.outer} {...testProps("account-screen-scroll-view")}>
          <AccountBanner />
          <AccountId />
          <UpgradeTrialAccount />
          <DangerZoneSettings />
        </View>
      </Screen>
    </AccountDeleteContextProvider>
  )
}

const useStyles = makeStyles(() => ({
  outer: {
    marginTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 20,
    rowGap: 12,
  },
}))
