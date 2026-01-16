"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountIcon = exports.AccountBanner = void 0;
/**
 * This component is the top banner on the settings screen
 * It shows the user their own username with a people icon
 * If the user isn't logged in, it shows Login or Create Account
 * Later on, this will support switching between accounts
 */
const react_native_1 = require("react-native");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const generated_1 = require("@app/graphql/generated");
const level_context_1 = require("@app/graphql/level-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const themed_1 = require("@rneui/themed");
const AccountBanner = () => {
    var _a;
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const navigation = (0, native_1.useNavigation)();
    const { currentLevel } = (0, level_context_1.useLevel)();
    const isUserLoggedIn = currentLevel !== level_context_1.AccountLevel.NonAuth;
    const { data, loading } = (0, generated_1.useSettingsScreenQuery)({ fetchPolicy: "cache-first" });
    const usernameTitle = ((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username) || LL.common.flashUser();
    if (loading)
        return <themed_1.Skeleton style={styles.outer} animation="pulse"/>;
    return (<react_native_gesture_handler_1.TouchableWithoutFeedback onPress={() => !isUserLoggedIn &&
            navigation.reset({
                index: 0,
                routes: [{ name: "getStarted" }],
            })}>
      <react_native_1.View style={styles.outer}>
        <exports.AccountIcon size={30}/>
        <themed_1.Text type="p2">
          {isUserLoggedIn ? usernameTitle : LL.SettingsScreen.logInOrCreateAccount()}
        </themed_1.Text>
      </react_native_1.View>
    </react_native_gesture_handler_1.TouchableWithoutFeedback>);
};
exports.AccountBanner = AccountBanner;
const AccountIcon = ({ size }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    return <galoy_icon_1.GaloyIcon name="user" size={size} backgroundColor={colors.grey4}/>;
};
exports.AccountIcon = AccountIcon;
const useStyles = (0, themed_1.makeStyles)(() => ({
    outer: {
        height: 70,
        padding: 4,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        columnGap: 12,
    },
}));
//# sourceMappingURL=banner.js.map