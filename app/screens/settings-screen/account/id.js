"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountId = void 0;
const react_1 = require("react");
const react_native_1 = require("react-native");
const galoy_icon_button_1 = require("@app/components/atomic/galoy-icon-button");
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const toast_1 = require("@app/utils/toast");
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const themed_1 = require("@rneui/themed");
const AccountId = () => {
    var _a, _b;
    const { data, loading } = (0, generated_1.useSettingsScreenQuery)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    const accountId = ((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.id) || "";
    const last6digitsOfAccountId = accountId === null || accountId === void 0 ? void 0 : accountId.slice(-6).toUpperCase();
    const copyToClipboard = (0, react_1.useCallback)(() => {
        clipboard_1.default.setString(accountId);
        (0, toast_1.toastShow)({
            message: (translations) => {
                return translations.AccountScreen.copiedAccountId();
            },
            type: "success",
            currentTranslation: LL,
        });
    }, [LL, accountId]);
    return (<react_native_1.View>
      <themed_1.Text type="p2" bold>
        {LL.AccountScreen.accountId()}
      </themed_1.Text>
      {loading ? (<themed_1.Skeleton style={styles.wrapper}/>) : (<react_native_1.View style={[styles.wrapper, styles.spacing]}>
          <react_native_1.View style={styles.accIdWrapper}>
            <react_native_1.View style={styles.accIdXs}>
              {Array(20)
                .fill(null)
                .map((_, i) => (<react_native_1.View style={styles.circle} key={i}/>))}
            </react_native_1.View>
            <themed_1.Text type="p3" style={styles.accIdText}>
              {last6digitsOfAccountId}
            </themed_1.Text>
          </react_native_1.View>
          <galoy_icon_button_1.GaloyIconButton name="copy-paste" size="medium" iconOnly onPress={copyToClipboard}/>
        </react_native_1.View>)}
    </react_native_1.View>);
};
exports.AccountId = AccountId;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    circle: {
        height: 4,
        width: 4,
        borderRadius: 2,
        backgroundColor: colors.black,
    },
    spacing: {
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    wrapper: {
        marginTop: 5,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.grey5,
        borderRadius: 10,
        marginBottom: 10,
        height: 48,
    },
    accIdWrapper: {
        display: "flex",
        flexDirection: "row",
        columnGap: 3,
    },
    accIdText: {},
    accIdXs: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        columnGap: 3,
    },
}));
//# sourceMappingURL=id.js.map