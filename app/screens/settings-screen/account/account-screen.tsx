import { ScrollView } from "react-native-gesture-handler"

import { Screen } from "@app/components/screen"
import { testProps } from "@app/utils/testProps"
import { makeStyles } from "@rneui/themed"

// import { SettingsGroup } from "../group"
import { AccountDeleteContextProvider } from "./account-delete-context"
import { AccountBanner } from "./banner"
import { AccountId } from "./id"
import { DangerZoneSettings } from "./settings/danger-zone"
// import { UpgradeAccountLevelOne } from "./settings/upgrade"
import { UpgradeTrialAccount } from "./settings/upgrade-trial-account"

export const AccountScreen: React.FC = () => {
  const styles = useStyles()

  return (
    <AccountDeleteContextProvider>
      <Screen
        keyboardShouldPersistTaps="handled"
        style={styles.outer}
        {...testProps("account-screen-scroll-view")}
      >
        <AccountBanner />
        <AccountId />
        <UpgradeTrialAccount />
        {/* <SettingsGroup items={[UpgradeAccountLevelOne]} /> */}
        <DangerZoneSettings />
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
