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
exports.DeviceAccountFailModal = void 0;
const custom_modal_1 = __importDefault(require("@app/components/custom-modal/custom-modal"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const React = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const DeviceAccountFailModal = ({ isVisible, closeModal, navigateToHomeScreen, }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    return (<custom_modal_1.default isVisible={isVisible} toggleModal={closeModal} image={<galoy_icon_1.GaloyIcon name="payment-error" size={100}/>} title={LL.GetStartedScreen.trialAccountCreationFailed()} body={<themed_1.Text style={styles.errorBodyText} type="h2">
          {LL.GetStartedScreen.trialAccountCreationFailedMessage()}
        </themed_1.Text>} primaryButtonTitle={LL.GetStartedScreen.exploreWallet()} primaryButtonOnPress={navigateToHomeScreen}/>);
};
exports.DeviceAccountFailModal = DeviceAccountFailModal;
const useStyles = (0, themed_1.makeStyles)(() => ({
    errorBodyText: {
        textAlign: "center",
    },
}));
//# sourceMappingURL=device-account-fail-modal.js.map