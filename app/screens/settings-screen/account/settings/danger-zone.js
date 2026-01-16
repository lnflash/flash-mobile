"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DangerZoneSettings = void 0;
const react_native_1 = require("react-native");
const level_context_1 = require("@app/graphql/level-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const delete_1 = require("./delete");
const logout_1 = require("./logout");
const SignInQRCode_1 = require("./SignInQRCode");
const DangerZoneSettings = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    const { currentLevel, isAtLeastLevelOne, isAtLeastLevelZero } = (0, level_context_1.useLevel)();
    if (!isAtLeastLevelZero)
        return <></>;
    return (<react_native_1.View style={styles.verticalSpacing}>
      <themed_1.Text type="p2" bold>
        {LL.AccountScreen.dangerZone()}
      </themed_1.Text>
      {isAtLeastLevelOne && <SignInQRCode_1.SignInQRCode />}
      {isAtLeastLevelOne && <logout_1.LogOut />}
      {currentLevel !== level_context_1.AccountLevel.NonAuth && <delete_1.Delete />}
    </react_native_1.View>);
};
exports.DangerZoneSettings = DangerZoneSettings;
const useStyles = (0, themed_1.makeStyles)(() => ({
    verticalSpacing: {
        marginTop: 10,
        display: "flex",
        flexDirection: "column",
        rowGap: 10,
    },
}));
//# sourceMappingURL=danger-zone.js.map