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
Object.defineProperty(exports, "__esModule", { value: true });
exports.useRequireContactList = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const native_1 = require("@react-navigation/native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const useRequireContactList = () => {
    const [visible, setVisible] = (0, react_1.useState)(false);
    const resolver = (0, react_1.useRef)();
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const promptForContactList = (0, react_1.useCallback)(() => {
        setVisible(true);
        return new Promise((resolve) => {
            resolver.current = resolve;
        });
    }, []);
    const handleChoice = (goToSettings) => {
        var _a;
        setVisible(false);
        // We resolve false regardless because the original action (adding a contact)
        // cannot proceed until the list is created in settings.
        (_a = resolver.current) === null || _a === void 0 ? void 0 : _a.call(resolver, false);
        navigation.navigate("NostrSettingsScreen");
    };
    const ModalComponent = (0, react_1.useMemo)(() => {
        return () => (<react_native_1.Modal visible={visible} transparent animationType="fade">
        <react_native_1.View style={styles.overlay}>
          <react_native_1.View style={styles.modal}>
            <react_native_1.Text style={styles.title}>{LL.Nostr.Contacts.noCantacts()}</react_native_1.Text>
            <react_native_1.Text style={styles.message}>
              {LL.Nostr.Contacts.noListDeepLinkMessage()}
            </react_native_1.Text>
            <react_native_1.View style={styles.buttonsRow}>
              <react_native_1.TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={() => handleChoice(true)}>
                <react_native_1.Text style={styles.confirmText}>{LL.Nostr.common.goToSettings()}</react_native_1.Text>
              </react_native_1.TouchableOpacity>
            </react_native_1.View>
          </react_native_1.View>
        </react_native_1.View>
      </react_native_1.Modal>);
    }, [visible]);
    return { promptForContactList, ModalComponent };
};
exports.useRequireContactList = useRequireContactList;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    overlay: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    modal: {
        backgroundColor: colors.white,
        borderRadius: 16,
        padding: 20,
        width: "85%",
    },
    title: {
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 10,
        color: colors.black,
    },
    message: {
        fontSize: 15,
        color: colors.grey3,
        marginBottom: 20,
        lineHeight: 22,
    },
    buttonsRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    button: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
    },
    cancelButton: {
        backgroundColor: colors.grey5,
        marginRight: 10,
    },
    confirmButton: {
        backgroundColor: colors.primary,
    },
    cancelText: {
        color: colors.black,
        fontWeight: "600",
    },
    confirmText: {
        color: colors.white,
        fontWeight: "600",
    },
}));
//# sourceMappingURL=require-contact-list-modal.js.map