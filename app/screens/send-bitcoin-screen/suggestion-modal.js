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
exports.SuggestionModal = void 0;
const React = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const testProps_1 = require("../../utils/testProps");
const custom_modal_1 = __importDefault(require("../../components/custom-modal/custom-modal"));
const generated_1 = require("@app/graphql/generated");
const client_1 = require("@apollo/client");
(0, client_1.gql) `
  mutation feedbackSubmit($input: FeedbackSubmitInput!) {
    feedbackSubmit(input: $input) {
      errors {
        message
        __typename
      }
      success
      __typename
    }
  }
`;
const SuggestionModal = ({ navigation, showSuggestionModal, setShowSuggestionModal }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const [suggestion, setSuggestion] = React.useState("");
    const [sendFeedback] = (0, generated_1.useFeedbackSubmitMutation)();
    const submitSuggestion = async () => {
        await sendFeedback({ variables: { input: { feedback: suggestion } } });
        setShowSuggestionModal(false);
        navigation.popToTop();
    };
    const dismissSuggestionModal = () => {
        navigation.popToTop();
        setShowSuggestionModal(false);
    };
    return (<custom_modal_1.default title={LL.support.thankYouText()} minHeight={"50%"} titleMaxWidth={"100%"} titleTextAlignment={"left"} toggleModal={dismissSuggestionModal} isVisible={showSuggestionModal} primaryButtonTitle={LL.common.submit()} primaryButtonOnPress={submitSuggestion} primaryButtonDisabled={suggestion === ""} body={<react_native_1.View style={styles.field}>
          <react_native_1.TextInput {...(0, testProps_1.testProps)(LL.SendBitcoinScreen.suggestionInput())} style={styles.noteInput} onChangeText={(improvement) => setSuggestion(improvement)} placeholder={LL.SendBitcoinScreen.suggestionInput()} placeholderTextColor={colors.grey2} value={suggestion} multiline={true} numberOfLines={3} autoFocus/>
        </react_native_1.View>} secondaryButtonTitle={LL.AuthenticationScreen.skip()} secondaryButtonOnPress={dismissSuggestionModal} showCloseIconButton={false}/>);
};
exports.SuggestionModal = SuggestionModal;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    noteInput: {
        color: colors.black,
    },
    field: {
        padding: 10,
        backgroundColor: colors.grey5,
        borderRadius: 10,
    },
}));
//# sourceMappingURL=suggestion-modal.js.map