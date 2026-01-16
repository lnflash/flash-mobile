"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportNsecModal = void 0;
const react_1 = __importDefault(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const import_nsec_form_1 = require("./import-nsec-form");
const i18n_react_1 = require("@app/i18n/i18n-react"); // <- add this
const ImportNsecModal = ({ isActive, onCancel, onSubmit, descriptionText, }) => {
    const { mode } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)(); // <- access translations
    const defaultText = LL.Nostr.importNsecDefaultDescription();
    return (<react_native_modal_1.default isVisible={isActive} backdropColor={mode === "dark" ? "#1d1d1d" : "#000"} backdropOpacity={0.7} onBackButtonPress={onCancel} onBackdropPress={onCancel} style={styles.modalStyle}>
      <react_native_1.View style={styles.modalBody}>
        <themed_1.Text style={styles.title}>{LL.Nostr.importNsecTitle()}</themed_1.Text>
        <themed_1.Text style={styles.description}>
          {descriptionText ? descriptionText : defaultText}
        </themed_1.Text>

        <import_nsec_form_1.NsecInputForm onSubmit={(nsec, success) => {
            if (success) {
                onSubmit();
                onCancel();
            }
        }}/>
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.ImportNsecModal = ImportNsecModal;
const useStyles = (0, themed_1.makeStyles)(({ colors, mode }) => {
    return {
        modalStyle: {
            justifyContent: "center",
        },
        modalBody: {
            padding: 20,
            borderRadius: 15,
            maxWidth: 350,
            alignSelf: "center",
            backgroundColor: mode === "dark" ? "black" : "white",
        },
        title: {
            fontSize: 18,
            fontWeight: "bold",
            marginBottom: 15,
            textAlign: "center",
        },
        description: {
            fontSize: 14,
            color: colors.grey0,
            marginBottom: 20,
            textAlign: "center",
        },
        inputContainer: {
            marginBottom: 20,
            width: 250,
        },
        inputLabel: {
            fontSize: 14,
        },
        input: {
            fontSize: 14,
            paddingVertical: 12,
            paddingHorizontal: 15,
            borderWidth: 1,
            borderRadius: 10,
            height: 10,
        },
    };
});
//# sourceMappingURL=import-nsec-modal.js.map