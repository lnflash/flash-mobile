"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_nfc_manager_1 = __importDefault(require("react-native-nfc-manager"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const themed_1 = require("@rneui/themed");
// types
const index_types_1 = require("@app/screens/receive-bitcoin-screen/payment/index.types");
// store
const persistent_state_1 = require("@app/store/persistent-state");
// assets
const nfc_signal_svg_1 = __importDefault(require("@app/assets/icons/nfc-signal.svg"));
const Header = ({ request, setDisplayReceiveNfc }) => {
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    (0, react_1.useEffect)(() => {
        if (persistentState.isAdvanceMode) {
            switch (request === null || request === void 0 ? void 0 : request.type) {
                case index_types_1.Invoice.OnChain:
                    navigation.setOptions({ title: LL.ReceiveScreen.receiveViaOnchain() });
                    break;
                case index_types_1.Invoice.Lightning:
                    navigation.setOptions({ title: LL.ReceiveScreen.receiveViaInvoice() });
                    break;
                case index_types_1.Invoice.PayCode:
                    navigation.setOptions({ title: LL.ReceiveScreen.receiveViaPaycode() });
            }
        }
        else {
            navigation.setOptions({ title: LL.ReceiveScreen.receive() });
        }
    }, [request === null || request === void 0 ? void 0 : request.type]);
    (0, react_1.useEffect)(() => {
        ;
        (async () => {
            if ((request === null || request === void 0 ? void 0 : request.type) === "Lightning" &&
                (request === null || request === void 0 ? void 0 : request.state) === "Created" &&
                (await react_native_nfc_manager_1.default.isSupported())) {
                navigation.setOptions({
                    headerRight: renderHeaderRight,
                });
            }
            else {
                navigation.setOptions({ headerRight: () => <></> });
            }
        })();
    }, [colors, navigation, request === null || request === void 0 ? void 0 : request.state, request === null || request === void 0 ? void 0 : request.type]);
    const renderHeaderRight = () => (<react_native_1.TouchableOpacity style={styles.nfcIcon} onPress={() => setDisplayReceiveNfc(true)}>
      <themed_1.Text type="p2" style={{ marginRight: 3 }}>
        {LL.ReceiveScreen.nfc()}
      </themed_1.Text>
      <nfc_signal_svg_1.default color={colors.black}/>
    </react_native_1.TouchableOpacity>);
    return null;
};
exports.default = Header;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    nfcIcon: {
        flexDirection: "row",
        borderRadius: 8,
        backgroundColor: colors.grey5,
        marginRight: 8,
        paddingHorizontal: 8,
        paddingVertical: 5,
    },
}));
//# sourceMappingURL=Header.js.map