import * as React from "react"
import { gql } from "@apollo/client"
import { makeStyles } from "@rneui/themed"
import { ScrollView } from "react-native-gesture-handler"
import { AccountLevel, useLevel } from "@app/graphql/level-context"
import { useI18nContext } from "@app/i18n/i18n-react"

import { Screen } from "../../components/screen"
import { VersionComponent } from "../../components/version"
import { AccountLNAddress } from "./settings/account-ln-address"
import { AccountLevelSetting } from "./settings/account-level"
import { AccountStaticQR } from "./settings/account-static-qr"
import { TxLimits } from "./settings/account-tx-limits"
import { PhoneSetting } from "./account/settings/phone"
import { AccountPOS } from "./settings/account-pos"
import { DefaultWallet } from "./settings/account-default-wallet"
import { LanguageSetting } from "./settings/preferences-language"
import { CurrencySetting } from "./settings/preferences-currency"
import { ThemeSetting } from "./settings/preferences-theme"
import { OnDeviceSecuritySetting } from "./settings/sp-security"
import { NeedHelpSetting } from "./settings/community-need-help"
import { NotificationSetting } from "./settings/sp-notifications"
import { JoinCommunitySetting } from "./settings/community-join"
import { NostrSecret } from "./settings/nostr-secret"
import { BackupWallet } from "./settings/backup-wallet"
import { ImportWallet } from "./settings/import-wallet"
import { AdvancedModeToggle as _AdvancedModeToggle } from "./settings/advanced-mode-toggle"
import { ExportCsvSetting } from "./settings/advanced-export-csv"
import { ApiAccessSetting as _ApiAccessSetting } from "./settings/advanced-api-access"
import { ManageMintsSetting } from "./settings/manage-mints"
import { GenerateReportsSetting } from "./settings/generate-reports"
import { SettingsGroup } from "./group"
import { EmailSetting } from "./account/settings/email"
import { ChatSetting } from "./chat-setting"
import {
  ECashWalletToggle,
  BitcoinWalletToggle,
  CashWalletToggle,
} from "./settings/wallet-display-toggle"
// import { TotpSetting } from "./totp"

gql`
  query settingsScreen {
    me {
      id
      phone
      username
      language
      defaultAccount {
        id
        defaultWalletId
        wallets {
          id
          balance
          walletCurrency
        }
      }
      totpEnabled
      email {
        address
        verified
      }
    }
  }
`

const items = {
  account: [AccountLevelSetting, /* AdvancedModeToggle, */ TxLimits],
  loginMethods: [EmailSetting, PhoneSetting],
  waysToGetPaid: [AccountLNAddress, AccountPOS, AccountStaticQR],
  reports: [GenerateReportsSetting],
  wallet: [NostrSecret, BackupWallet, ImportWallet],
  walletDisplay: [ECashWalletToggle, BitcoinWalletToggle, CashWalletToggle],
  preferences: [
    NotificationSetting,
    DefaultWallet,
    LanguageSetting,
    CurrencySetting,
    ThemeSetting,
  ],
  experimental: [ChatSetting, NostrSecret],
  securityAndPrivacy: [
    // TotpSetting,
    OnDeviceSecuritySetting,
  ],
  advanced: [
    ExportCsvSetting,
    ManageMintsSetting,
    //  ApiAccessSetting
  ],
  community: [NeedHelpSetting, JoinCommunitySetting],
}

export const SettingsScreen: React.FC = () => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { isAtLeastLevelOne } = useLevel()
  const { currentLevel } = useLevel()

  return (
    <Screen preset="scroll" keyboardShouldPersistTaps="handled">
      <ScrollView contentContainerStyle={styles.outer}>
        <SettingsGroup
          name="Wallets"
          items={items.walletDisplay}
          initiallyExpanded={false}
        />
        <SettingsGroup
          name={LL.common.preferences()}
          items={items.preferences}
          initiallyExpanded={false}
        />
        <SettingsGroup
          name={LL.SettingsScreen.addressScreen()}
          items={items.waysToGetPaid}
          initiallyExpanded={false}
        />
        <SettingsGroup
          name={LL.common.account()}
          items={items.account}
          initiallyExpanded={false}
        />
        <SettingsGroup
          name={LL.common.securityAndPrivacy()}
          items={items.securityAndPrivacy}
          initiallyExpanded={false}
        />
        {isAtLeastLevelOne && (
          <SettingsGroup
            name={LL.AccountScreen.loginMethods()}
            items={items.loginMethods}
            initiallyExpanded={false}
          />
        )}
        <SettingsGroup
          name={LL.SettingsScreen.keysManagement()}
          items={items.wallet}
          initiallyExpanded={false}
        />
        <SettingsGroup
          name="Experimental"
          items={items.chats}
          initiallyExpanded={false}
        />
        {currentLevel === AccountLevel.Two && (
          <SettingsGroup name="Reports" items={items.reports} initiallyExpanded={false} />
        )}
        <SettingsGroup
          name={LL.common.advanced()}
          items={items.advanced}
          initiallyExpanded={false}
        />
        <SettingsGroup
          name={LL.common.community()}
          items={items.community}
          initiallyExpanded={false}
        />
        <VersionComponent />
      </ScrollView>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  outer: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 20,
    display: "flex",
    flexDirection: "column",
    rowGap: 18,
  },
  headerRight: {
    marginRight: 12,
  },
  notificationCount: {
    position: "absolute",
    right: 9,
    top: -3,
    color: colors._darkGrey,
    backgroundColor: colors.primary,
    textAlign: "center",
    verticalAlign: "middle",
    height: 18,
    width: 18,
    borderRadius: 9,
    overflow: "hidden",
  },
}))
