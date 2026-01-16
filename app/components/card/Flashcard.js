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
const themed_1 = require("@rneui/themed");
// components
const buttons_1 = require("../buttons");
const RecentActivity_1 = __importDefault(require("./RecentActivity"));
const ActivityIndicatorContext_1 = require("@app/contexts/ActivityIndicatorContext");
const hideable_area_1 = __importDefault(require("../hideable-area/hideable-area"));
const CardSettingsModal_1 = __importDefault(require("./CardSettingsModal"));
// hooks
const hooks_1 = require("@app/hooks");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
// assets
const flashcard_png_1 = __importDefault(require("@app/assets/images/flashcard.png"));
const sync_svg_1 = __importDefault(require("@app/assets/icons/sync.svg"));
// utils
const amounts_1 = require("@app/types/amounts");
const Flashcard = ({ onReload, onTopup }) => {
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { balanceInSats, transactions, readFlashcard, resetFlashcard } = (0, hooks_1.useFlashcard)();
    const { formatMoneyAmount } = (0, hooks_1.useDisplayCurrency)();
    const { convertMoneyAmount } = isAuthed
        ? (0, hooks_1.usePriceConversion)()
        : (0, hooks_1.useUnauthedPriceConversion)();
    const { data: { hideBalance = false } = {} } = (0, generated_1.useHideBalanceQuery)();
    // Settings modal state
    const [settingsVisible, setSettingsVisible] = (0, react_1.useState)(false);
    if (!convertMoneyAmount) {
        return <ActivityIndicatorContext_1.Loading />;
    }
    const convertedBalance = convertMoneyAmount((0, amounts_1.toBtcMoneyAmount)(balanceInSats), amounts_1.DisplayCurrency);
    const formattedBalance = formatMoneyAmount({
        moneyAmount: convertedBalance,
        noSymbol: false,
    });
    return (<>
      <react_native_1.ScrollView>
        <react_native_1.Image source={flashcard_png_1.default} style={styles.flashcard}/>
        <react_native_1.View style={styles.top}/>
        <react_native_1.View style={styles.balanceWrapper}>
          <hideable_area_1.default isContentVisible={hideBalance}>
            <themed_1.Text type="h03">{formattedBalance}</themed_1.Text>
            <react_native_1.TouchableOpacity style={styles.sync} onPress={() => readFlashcard(false)}>
              <sync_svg_1.default color={colors.icon02} width={32} height={32}/>
            </react_native_1.TouchableOpacity>
          </hideable_area_1.default>
        </react_native_1.View>
        {isAuthed && (<react_native_1.View style={styles.btns}>
            <buttons_1.IconBtn type="clear" icon="down" label={`Reload\nCard`} onPress={onReload}/>
            <buttons_1.IconBtn type="clear" icon="qr" label={`Topup via\nQR`} onPress={onTopup}/>
            <buttons_1.IconBtn type="clear" icon="setting" label={`Card\nSettings`} onPress={() => setSettingsVisible(true)}/>
            <buttons_1.IconBtn type="clear" icon={"cardRemove"} label={`Remove\nCard`} onPress={resetFlashcard}/>
          </react_native_1.View>)}
        <react_native_1.View style={styles.caption}>
          <themed_1.Text type="bl" bold>
            Do not throw away your card!
          </themed_1.Text>
          <themed_1.Text type="caption">If your card is lost, the funds are not recoverable</themed_1.Text>
        </react_native_1.View>
        <RecentActivity_1.default transactions={transactions} convertMoneyAmount={convertMoneyAmount}/>
      </react_native_1.ScrollView>

      {/* Card Settings Modal */}
      <CardSettingsModal_1.default isVisible={settingsVisible} onClose={() => setSettingsVisible(false)}/>
    </>);
};
exports.default = Flashcard;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    top: {
        paddingTop: 210,
    },
    flashcard: {
        position: "absolute",
        alignSelf: "center",
        top: 10,
    },
    balanceWrapper: {
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 30,
    },
    sync: {
        paddingVertical: 5,
        paddingHorizontal: 10,
    },
    btns: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 16,
    },
    caption: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border01,
        padding: 16,
        marginHorizontal: 20,
        marginVertical: 15,
        backgroundColor: colors.layer,
    },
}));
//# sourceMappingURL=Flashcard.js.map