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
exports.NsecInputForm = void 0;
const react_1 = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
const generated_1 = require("@app/graphql/generated");
const utils_1 = require("./utils");
const nostr_tools_1 = require("nostr-tools");
const buttons_1 = require("../buttons");
const NsecInputForm = ({ onSubmit }) => {
    const [nsec, setNsec] = (0, react_1.useState)("");
    const [error, setError] = (0, react_1.useState)(null);
    const [userUpdateNpubMutation] = (0, generated_1.useUserUpdateNpubMutation)();
    const styles = useStyles();
    const handleInputChange = (text) => {
        setNsec(text);
        setError(null);
    };
    const handleSubmit = async () => {
        let success = await (0, utils_1.importNsec)(nsec, setError, async () => {
            await userUpdateNpubMutation({
                variables: {
                    input: {
                        npub: nostr_tools_1.nip19.npubEncode((0, nostr_tools_1.getPublicKey)(nostr_tools_1.nip19.decode(nsec).data)),
                    },
                },
            });
        });
        if (success) {
            react_native_1.Alert.alert("Success", "nsec imported successfully!");
        }
        onSubmit(nsec, success);
    };
    return (<react_native_1.View>
      <themed_1.Input value={nsec} onChangeText={handleInputChange} placeholder="nsec1..." errorMessage={error || ""} containerStyle={styles.inputContainer} inputStyle={styles.input} labelStyle={styles.inputLabel} errorStyle={styles.errorText}/>
      <buttons_1.PrimaryBtn label={"Submit"} onPress={handleSubmit}/>
    </react_native_1.View>);
};
exports.NsecInputForm = NsecInputForm;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    inputContainer: {
        width: "100%",
        maxWidth: "100%",
    },
    inputLabel: {
        fontSize: 14,
        marginBottom: 5,
        marginTop: 5,
    },
    input: {
        fontSize: 14,
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderWidth: 1,
        borderRadius: 8,
        height: 40,
        borderColor: colors.grey3,
        backgroundColor: colors.white,
    },
    errorText: {
        fontSize: 12,
        color: colors.red,
    },
}));
//# sourceMappingURL=import-nsec-form.js.map