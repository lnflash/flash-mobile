"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionLimitsScreen = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const client_1 = require("@apollo/client");
// components
const screen_1 = require("@app/components/screen");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const transaction_limits_1 = require("@app/components/transaction-limits");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const hooks_1 = require("@app/hooks");
(0, client_1.gql) `
  query accountLimits {
    me {
      id
      defaultAccount {
        id
        limits {
          withdrawal {
            totalLimit
            remainingLimit
            interval
          }
          internalSend {
            totalLimit
            remainingLimit
            interval
          }
          convert {
            totalLimit
            remainingLimit
            interval
          }
        }
      }
    }
  }
`;
const TransactionLimitsScreen = () => {
    var _a, _b, _c, _d;
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const { data, loading, error, refetch } = (0, generated_1.useAccountLimitsQuery)({
        fetchPolicy: "no-cache",
        skip: !(0, is_authed_context_1.useIsAuthed)(),
    });
    const { name: bankName } = appConfig.galoyInstance;
    if (error) {
        return (<screen_1.Screen>
        <react_native_1.View style={styles.errorWrapper}>
          <themed_1.Text adjustsFontSizeToFit style={styles.errorText}>
            {LL.TransactionLimitsScreen.error()}
          </themed_1.Text>
          <react_native_1.Button title="reload" disabled={loading} color={colors.error} onPress={() => refetch()}/>
        </react_native_1.View>
      </screen_1.Screen>);
    }
    else if (loading) {
        return (<screen_1.Screen>
        <react_native_1.View style={styles.loadingWrapper}>
          <react_native_1.ActivityIndicator animating size="large" color={colors.primary}/>
        </react_native_1.View>
      </screen_1.Screen>);
    }
    return (<screen_1.Screen preset="scroll">
      <react_native_1.View style={styles.limitWrapper}>
        <themed_1.Text adjustsFontSizeToFit style={styles.valueFieldType}>
          {LL.TransactionLimitsScreen.receive()}
        </themed_1.Text>
        <react_native_1.View>
          <react_native_1.View style={styles.contentTextBox}>
            <themed_1.Text adjustsFontSizeToFit style={styles.valueRemaining}>
              {LL.TransactionLimitsScreen.unlimited()}
            </themed_1.Text>
          </react_native_1.View>
        </react_native_1.View>
      </react_native_1.View>
      <react_native_1.View style={styles.divider}></react_native_1.View>
      <react_native_1.View style={styles.limitWrapper}>
        <themed_1.Text adjustsFontSizeToFit style={styles.valueFieldType}>
          {LL.TransactionLimitsScreen.withdraw()}
        </themed_1.Text>
        {(_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount.limits) === null || _b === void 0 ? void 0 : _b.withdrawal.map((data, index) => (<transaction_limits_1.TransactionLimitsPeriod key={index} {...data}/>))}
      </react_native_1.View>
      <react_native_1.View style={styles.divider}></react_native_1.View>
      <react_native_1.View style={styles.limitWrapper}>
        <themed_1.Text adjustsFontSizeToFit style={styles.valueFieldType}>
          {LL.TransactionLimitsScreen.internalSend({ bankName })}
        </themed_1.Text>
        {(_d = (_c = data === null || data === void 0 ? void 0 : data.me) === null || _c === void 0 ? void 0 : _c.defaultAccount.limits) === null || _d === void 0 ? void 0 : _d.internalSend.map((data, index) => (<transaction_limits_1.TransactionLimitsPeriod key={index} {...data}/>))}
      </react_native_1.View>
      <react_native_1.View style={styles.divider}></react_native_1.View>
      <react_native_1.View style={styles.infoWrapper}>
        <react_native_1.View style={styles.infoTitleWrapper}>
          <galoy_icon_1.GaloyIcon name={"info"} size={20} color={colors.grey0}/>
          <themed_1.Text style={styles.infoTitle}>
            {LL.TransactionLimitsScreen.spendingLimits()}
          </themed_1.Text>
        </react_native_1.View>
        <themed_1.Text style={styles.infoDescription}>
          {LL.TransactionLimitsScreen.spendingLimitsDescription()}
        </themed_1.Text>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.TransactionLimitsScreen = TransactionLimitsScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    limitWrapper: {
        padding: 20,
        backgroundColor: colors.white,
    },
    contentTextBox: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 5,
    },
    valueFieldType: {
        fontWeight: "bold",
        fontSize: 15,
        paddingBottom: 8,
    },
    valueRemaining: {
        fontWeight: "bold",
        color: colors.green,
        maxWidth: "50%",
    },
    divider: {
        marginVertical: 0,
        borderWidth: 1,
        borderColor: colors.grey4,
    },
    errorWrapper: {
        justifyContent: "center",
        alignItems: "center",
        marginTop: "50%",
        marginBottom: "50%",
    },
    errorText: {
        color: colors.error,
        fontWeight: "bold",
        fontSize: 18,
        marginBottom: 20,
    },
    loadingWrapper: {
        justifyContent: "center",
        alignItems: "center",
        marginTop: "50%",
        marginBottom: "50%",
    },
    infoWrapper: {
        marginTop: 20,
        marginHorizontal: 20,
    },
    infoTitleWrapper: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },
    infoTitle: {
        fontSize: 16,
        marginLeft: 5,
        color: colors.grey0,
    },
    infoDescription: {
        fontSize: 14,
        color: colors.grey1,
    },
}));
//# sourceMappingURL=transaction-limits-screen.js.map