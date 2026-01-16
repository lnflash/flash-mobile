"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsScreen = void 0;
const React = __importStar(require("react"));
const client_1 = require("@apollo/client");
const themed_1 = require("@rneui/themed");
const level_context_1 = require("@app/graphql/level-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const screen_1 = require("../../components/screen");
const version_1 = require("../../components/version");
const account_ln_address_1 = require("./settings/account-ln-address");
const account_level_1 = require("./settings/account-level");
const account_static_qr_1 = require("./settings/account-static-qr");
const account_tx_limits_1 = require("./settings/account-tx-limits");
const phone_1 = require("./account/settings/phone");
const account_pos_1 = require("./settings/account-pos");
const account_default_wallet_1 = require("./settings/account-default-wallet");
const preferences_language_1 = require("./settings/preferences-language");
const preferences_currency_1 = require("./settings/preferences-currency");
const preferences_theme_1 = require("./settings/preferences-theme");
const sp_security_1 = require("./settings/sp-security");
const community_need_help_1 = require("./settings/community-need-help");
const sp_notifications_1 = require("./settings/sp-notifications");
const community_join_1 = require("./settings/community-join");
const nostr_secret_1 = require("./settings/nostr-secret");
const backup_wallet_1 = require("./settings/backup-wallet");
const import_wallet_1 = require("./settings/import-wallet");
const advanced_mode_toggle_1 = require("./settings/advanced-mode-toggle");
const advanced_export_csv_1 = require("./settings/advanced-export-csv");
const generate_reports_1 = require("./settings/generate-reports");
const group_1 = require("./group");
const email_1 = require("./account/settings/email");
// import { TotpSetting } from "./totp"
(0, client_1.gql) `
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
`;
const items = {
    account: [account_level_1.AccountLevelSetting, account_tx_limits_1.TxLimits],
    loginMethods: [email_1.EmailSetting, phone_1.PhoneSetting],
    waysToGetPaid: [account_ln_address_1.AccountLNAddress, account_pos_1.AccountPOS, account_static_qr_1.AccountStaticQR],
    reports: [generate_reports_1.GenerateReportsSetting],
    wallet: [backup_wallet_1.BackupWallet, import_wallet_1.ImportWallet],
    preferences: [
        sp_notifications_1.NotificationSetting,
        account_default_wallet_1.DefaultWallet,
        preferences_language_1.LanguageSetting,
        preferences_currency_1.CurrencySetting,
        preferences_theme_1.ThemeSetting,
    ],
    experimental: [nostr_secret_1.NostrSecret],
    securityAndPrivacy: [
        // TotpSetting,
        sp_security_1.OnDeviceSecuritySetting,
    ],
    advanced: [
        advanced_mode_toggle_1.AdvancedModeToggle,
        advanced_export_csv_1.ExportCsvSetting,
        //  ApiAccessSetting
    ],
    community: [community_join_1.JoinCommunitySetting],
};
const SettingsScreen = () => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { isAtLeastLevelOne } = (0, level_context_1.useLevel)();
    const { currentLevel } = (0, level_context_1.useLevel)();
    return (<screen_1.Screen preset="scroll" keyboardShouldPersistTaps="handled" style={styles.outer}>
      <community_need_help_1.NeedHelpSetting />
      <group_1.SettingsGroup name={LL.common.account()} items={items.account}/>
      {isAtLeastLevelOne && (<group_1.SettingsGroup name={LL.AccountScreen.loginMethods()} items={items.loginMethods}/>)}
      <group_1.SettingsGroup name={LL.SettingsScreen.addressScreen()} items={items.waysToGetPaid}/>
      {(currentLevel === level_context_1.AccountLevel.Two || currentLevel === level_context_1.AccountLevel.Three) && (<group_1.SettingsGroup name="Reports" items={items.reports}/>)}
      <group_1.SettingsGroup name="Experimental" items={items.experimental}/>
      <group_1.SettingsGroup name={LL.SettingsScreen.keysManagement()} items={items.wallet}/>
      <group_1.SettingsGroup name={LL.common.preferences()} items={items.preferences}/>
      <group_1.SettingsGroup name={LL.common.securityAndPrivacy()} items={items.securityAndPrivacy}/>
      <group_1.SettingsGroup name={LL.common.advanced()} items={items.advanced}/>
      <group_1.SettingsGroup name={LL.common.community()} items={items.community}/>
      <version_1.VersionComponent />
    </screen_1.Screen>);
};
exports.SettingsScreen = SettingsScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    outer: {
        marginTop: 12,
        paddingHorizontal: 20,
        paddingBottom: 20,
        display: "flex",
        flexDirection: "column",
        rowGap: 18,
        flexGrow: 1,
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
}));
//# sourceMappingURL=settings-screen.js.map