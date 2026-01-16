"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const CashoutCard = ({ title, detail }) => {
    const styles = useStyles();
    return (<react_native_1.View>
      <themed_1.Text type="bl" bold>
        {title}
      </themed_1.Text>
      <react_native_1.View style={styles.card}>
        <themed_1.Text type="bl">{detail}</themed_1.Text>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.default = CashoutCard;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    card: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 10,
        marginTop: 5,
        marginBottom: 15,
        padding: 15,
        backgroundColor: colors.grey5,
    },
}));
//# sourceMappingURL=CashoutCard.js.map