"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlashcardTopup = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
// components
const screen_1 = require("@app/components/screen");
const qr_view_1 = require("../receive-bitcoin-screen/qr-view");
// utils
const testProps_1 = require("../../utils/testProps");
const index_types_1 = require("../receive-bitcoin-screen/payment/index.types");
const FlashcardTopup = ({ route }) => {
    const { colors } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const flashcardLnurl = route.params.flashcardLnurl || "";
    const handleCopy = () => {
        clipboard_1.default.setString(flashcardLnurl);
    };
    const handleShare = async () => {
        await react_native_1.Share.share({ message: flashcardLnurl });
    };
    return (<>
      <screen_1.Screen preset="scroll" keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled" style={styles.screenStyle}>
        <qr_view_1.QRView type={index_types_1.Invoice.PayCode} getFullUri={flashcardLnurl} loading={false} completed={false} err={""} style={styles.qrView} expired={false} copyToClipboard={handleCopy} isPayCode={true} canUsePayCode={true} toggleIsSetLightningAddressModalVisible={() => { }}/>

        <react_native_1.View style={styles.extraDetails}>
          <react_native_1.TouchableOpacity onPress={handleCopy}>
            <themed_1.Text {...(0, testProps_1.testProps)("readable-payment-request")}>
              {`${flashcardLnurl.slice(0, 15)}...${flashcardLnurl.slice(-15)}`}
            </themed_1.Text>
          </react_native_1.TouchableOpacity>
          <react_native_1.TouchableOpacity onPress={handleShare} style={styles.shareInvoice}>
            <Ionicons_1.default color={colors.grey2} name="share-outline" size={30}/>
          </react_native_1.TouchableOpacity>
        </react_native_1.View>

        <react_native_1.View style={styles.extraDetails}>
          <themed_1.Text style={styles.instructions}>
            {LL.ReceiveScreen.flashcardInstructions()}
          </themed_1.Text>
        </react_native_1.View>
      </screen_1.Screen>
    </>);
};
exports.FlashcardTopup = FlashcardTopup;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexGrow: 1,
    },
    qrView: {
        marginBottom: 10,
    },
    extraDetails: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 10,
    },
    shareInvoice: {
        marginLeft: 5,
    },
    instructions: {
        fontSize: 28,
        color: colors.green,
        marginBottom: 10,
        textAlign: "center",
    },
}));
//# sourceMappingURL=flashcard-topup.js.map