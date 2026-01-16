"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const i18n_react_1 = require("@app/i18n/i18n-react");
const CashoutPercentage = ({ setAmountToBalancePercentage }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    return (<react_native_1.View style={styles.fieldContainer}>
      <themed_1.Text type="bl" bold>
        {LL.Cashout.percentageToCashout()}
      </themed_1.Text>
      <react_native_1.View style={styles.percentageFieldContainer}>
        <react_native_1.TouchableOpacity style={Object.assign(Object.assign({}, styles.percentageField), { marginRight: 20 })} onPress={() => setAmountToBalancePercentage(50)}>
          <themed_1.Text>50%</themed_1.Text>
        </react_native_1.TouchableOpacity>
        <react_native_1.TouchableOpacity style={styles.percentageField} onPress={() => setAmountToBalancePercentage(100)}>
          <themed_1.Text>100%</themed_1.Text>
        </react_native_1.TouchableOpacity>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.default = CashoutPercentage;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    fieldContainer: {
        marginVertical: 15,
    },
    percentageFieldContainer: {
        flex: 1,
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 5,
    },
    percentageField: {
        flex: 1,
        alignItems: "center",
        borderRadius: 10,
        minWidth: 80,
        padding: 10,
        backgroundColor: colors.grey5,
    },
}));
//# sourceMappingURL=CashoutPercentage.js.map