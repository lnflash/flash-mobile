"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyModal = void 0;
const utils_1 = require("@noble/curves/abstract/utils");
const styles_1 = require("./styles");
const nostr_tools_1 = require("nostr-tools");
const react_1 = require("react");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const buttons_1 = require("@app/components/buttons");
const i18n_react_1 = require("@app/i18n/i18n-react"); // <-- import i18n
const KeyModal = ({ isOpen, secretKeyHex, keysModalType, onClose, copyToClipboard, }) => {
    const styles = (0, styles_1.useStyles)();
    const { mode } = (0, themed_1.useTheme)().theme;
    const [hideSecret, setHideSecret] = (0, react_1.useState)(true);
    const secretKey = (0, utils_1.hexToBytes)(secretKeyHex);
    const nostrPubKey = nostr_tools_1.nip19.npubEncode((0, nostr_tools_1.getPublicKey)(secretKey));
    const isPublic = keysModalType === "public";
    const keyValue = isPublic
        ? nostrPubKey
        : hideSecret
            ? "***************"
            : nostr_tools_1.nip19.nsecEncode(secretKey);
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)(); // <-- use translations
    const onCopy = () => copyToClipboard(isPublic ? nostrPubKey : nostr_tools_1.nip19.nsecEncode(secretKey), () => react_native_1.Alert.alert(LL.Nostr.common.copied(), LL.Nostr.KeyModal.keyCopiedToClipboard()));
    return (<react_native_modal_1.default isVisible={isOpen} backdropColor={mode === "dark" ? "rgba(57,57,57,.7)" : "rgba(0,0,0,.5)"} backdropOpacity={1} onBackButtonPress={onClose} onBackdropPress={onClose}>
      <react_native_1.View style={styles.modalContainer}>
        <themed_1.Text style={styles.modalTitle}>
          {isPublic
            ? LL.Nostr.KeyModal.yourPublicProfileId()
            : LL.Nostr.KeyModal.yourPrivateProfileKey()}
        </themed_1.Text>

        <react_native_1.View style={[
            styles.keyContainer,
            {
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: colors.grey3,
                borderRadius: 8,
                backgroundColor: colors.white,
            },
        ]}>
          <themed_1.Text style={{
            flex: 1,
            fontFamily: "monospace",
            fontSize: 14,
            color: colors.black,
        }} numberOfLines={1} ellipsizeMode="middle">
            {keyValue}
          </themed_1.Text>
          {!isPublic && (<react_native_1.TouchableOpacity onPress={() => setHideSecret(!hideSecret)}>
              <Ionicons_1.default name={hideSecret ? "eye" : "eye-off"} size={22} color={colors.primary}/>
            </react_native_1.TouchableOpacity>)}
        </react_native_1.View>

        <react_native_1.View style={styles.modalButtonsRow}>
          <buttons_1.PrimaryBtn type="outline" label={LL.Nostr.common.copy()} onPress={onCopy} btnStyle={{ minWidth: 150 }}/>
          <buttons_1.PrimaryBtn label={LL.common.close()} onPress={onClose} btnStyle={{ minWidth: 150 }}/>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.KeyModal = KeyModal;
//# sourceMappingURL=key-modal.js.map