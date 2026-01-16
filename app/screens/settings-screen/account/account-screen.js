"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountScreen = void 0;
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// components
const id_1 = require("./id");
const banner_1 = require("./banner");
const screen_1 = require("@app/components/screen");
const danger_zone_1 = require("./settings/danger-zone");
const account_delete_context_1 = require("./account-delete-context");
const upgrade_trial_account_1 = require("./settings/upgrade-trial-account");
// type
const testProps_1 = require("@app/utils/testProps");
const AccountScreen = () => {
    const styles = useStyles();
    return (<account_delete_context_1.AccountDeleteContextProvider>
      <screen_1.Screen keyboardShouldPersistTaps="handled">
        <react_native_1.View style={styles.outer} {...(0, testProps_1.testProps)("account-screen-scroll-view")}>
          <banner_1.AccountBanner />
          <id_1.AccountId />
          <upgrade_trial_account_1.UpgradeTrialAccount />
          <danger_zone_1.DangerZoneSettings />
        </react_native_1.View>
      </screen_1.Screen>
    </account_delete_context_1.AccountDeleteContextProvider>);
};
exports.AccountScreen = AccountScreen;
const useStyles = (0, themed_1.makeStyles)(() => ({
    outer: {
        marginTop: 10,
        paddingHorizontal: 20,
        paddingBottom: 20,
        rowGap: 12,
    },
}));
//# sourceMappingURL=account-screen.js.map