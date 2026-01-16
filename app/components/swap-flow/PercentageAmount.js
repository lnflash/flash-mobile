"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const PercentageAmount = ({ fromWalletCurrency, setAmountToBalancePercentage, }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    return (<react_native_1.View style={styles.fieldContainer}>
      <react_native_1.View style={styles.percentageLabelContainer}>
        <themed_1.Text style={styles.percentageFieldLabel}>
          {LL.TransferScreen.percentageToConvert()}
        </themed_1.Text>
      </react_native_1.View>
      <react_native_1.View style={styles.percentageContainer}>
        <react_native_1.View style={styles.percentageFieldContainer}>
          <react_native_1.TouchableOpacity style={styles.percentageField} onPress={() => setAmountToBalancePercentage(25)}>
            <themed_1.Text>25%</themed_1.Text>
          </react_native_1.TouchableOpacity>
          <react_native_1.TouchableOpacity style={styles.percentageField} onPress={() => setAmountToBalancePercentage(50)}>
            <themed_1.Text>50%</themed_1.Text>
          </react_native_1.TouchableOpacity>
          <react_native_1.TouchableOpacity style={styles.percentageField} onPress={() => setAmountToBalancePercentage(75)}>
            <themed_1.Text>75%</themed_1.Text>
          </react_native_1.TouchableOpacity>
          <react_native_1.TouchableOpacity style={styles.percentageField} onPress={() => setAmountToBalancePercentage(fromWalletCurrency === "BTC" ? 90 : 99)}>
            <themed_1.Text>{fromWalletCurrency === "BTC" ? "90%" : "100%"}</themed_1.Text>
          </react_native_1.TouchableOpacity>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.default = PercentageAmount;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    fieldContainer: {
        marginBottom: 20,
    },
    percentageFieldLabel: {
        fontSize: 12,
        fontWeight: "bold",
        padding: 10,
    },
    percentageFieldContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        flex: 1,
        flexWrap: "wrap",
    },
    percentageField: {
        backgroundColor: colors.grey5,
        padding: 10,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
        marginVertical: 5,
        minWidth: 80,
    },
    percentageLabelContainer: {
        flex: 1,
    },
    percentageContainer: {
        flexDirection: "row",
    },
}));
//# sourceMappingURL=PercentageAmount.js.map