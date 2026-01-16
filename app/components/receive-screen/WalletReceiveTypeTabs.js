"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// components
const WalletBottomSheet_1 = __importDefault(require("./WalletBottomSheet"));
const ReceiveTypeBottomSheet_1 = __importDefault(require("./ReceiveTypeBottomSheet"));
// store
const persistent_state_1 = require("@app/store/persistent-state");
// types
const index_types_1 = require("@app/screens/receive-bitcoin-screen/payment/index.types");
const WalletReceiveTypeTabs = ({ request }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const onChangeWallet = (id) => {
        if (id === "BTC" && request.type === "PayCode") {
            request.setType("Lightning");
        }
        request.setReceivingWallet(id);
    };
    const onChangeReceiveType = (id) => {
        request.setType(id);
    };
    if (persistentState.isAdvanceMode) {
        return (<react_native_1.View style={styles.wrapper}>
        <WalletBottomSheet_1.default currency={request.receivingWalletDescriptor.currency} disabled={request.state === index_types_1.PaymentRequestState.Loading} onChange={onChangeWallet}/>
        <react_native_1.View style={{ width: 10 }}/>
        <ReceiveTypeBottomSheet_1.default currency={request.receivingWalletDescriptor.currency} type={request.type} disabled={request.state === index_types_1.PaymentRequestState.Loading} onChange={onChangeReceiveType}/>
      </react_native_1.View>);
    }
    else {
        return (<react_native_1.View style={styles.wrapper}>
        <react_native_1.TouchableOpacity style={[
                styles.btn,
                request.type === "Lightning" ? { borderColor: colors.accent02 } : {},
            ]} onPress={() => onChangeReceiveType("Lightning")}>
          <themed_1.Icon name={"flash"} color={"#F0C243"} size={25} type="ionicon"/>
          <themed_1.Text type="bl" style={request.type === "Lightning" ? { color: colors.accent02 } : {}}>
            Lightning
          </themed_1.Text>
        </react_native_1.TouchableOpacity>
        <react_native_1.View style={{ width: 10 }}/>
        <react_native_1.TouchableOpacity style={[
                styles.btn,
                request.type === "OnChain" ? { borderColor: colors.accent02 } : {},
            ]} onPress={() => onChangeReceiveType("OnChain")}>
          <themed_1.Icon name={"logo-bitcoin"} color={"#41AC48"} size={25} type="ionicon"/>
          <themed_1.Text type="bl" style={request.type === "OnChain" ? { color: colors.accent02 } : {}}>
            Onchain
          </themed_1.Text>
        </react_native_1.TouchableOpacity>
      </react_native_1.View>);
    }
};
exports.default = WalletReceiveTypeTabs;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    wrapper: {
        flexDirection: "row",
        marginBottom: 10,
    },
    btn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 15,
        borderWidth: 1,
        padding: 10,
        flex: 1,
        borderColor: colors.border01,
    },
}));
//# sourceMappingURL=WalletReceiveTypeTabs.js.map