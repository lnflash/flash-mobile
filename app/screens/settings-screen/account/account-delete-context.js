"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAccountDeleteContext = exports.AccountDeleteContextProvider = void 0;
const react_1 = require("react");
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const AccountDeleteContext = (0, react_1.createContext)({
    setAccountIsBeingDeleted: () => { },
});
const AccountDeleteContextProvider = ({ children, }) => {
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [accountIsBeingDeleted, setAccountIsBeingDeleted] = (0, react_1.useState)(false);
    const Loading = (<react_native_1.View style={styles.center}>
      <react_native_1.ActivityIndicator />
      <themed_1.Text type="p2" color={colors.grey2}>
        {LL.AccountScreen.accountBeingDeleted()}
      </themed_1.Text>
    </react_native_1.View>);
    return (<AccountDeleteContext.Provider value={{ setAccountIsBeingDeleted }}>
      {accountIsBeingDeleted ? Loading : children}
    </AccountDeleteContext.Provider>);
};
exports.AccountDeleteContextProvider = AccountDeleteContextProvider;
const useAccountDeleteContext = () => (0, react_1.useContext)(AccountDeleteContext);
exports.useAccountDeleteContext = useAccountDeleteContext;
const useStyles = (0, themed_1.makeStyles)(() => ({
    center: {
        height: "100%",
        display: "flex",
        flexDirection: "column",
        rowGap: 10,
        justifyContent: "center",
        alignItems: "center",
    },
}));
//# sourceMappingURL=account-delete-context.js.map