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
exports.UpgradeTrialAccount = void 0;
const react_1 = require("react");
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// components
const contact_modal_1 = __importStar(require("@app/components/contact-modal/contact-modal"));
const buttons_1 = require("@app/components/buttons");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const upgrade_account_modal_1 = require("@app/components/upgrade-account-modal");
const galoy_secondary_button_1 = require("@app/components/atomic/galoy-secondary-button");
// hooks
const show_warning_secure_account_hook_1 = require("../show-warning-secure-account-hook");
const level_context_1 = require("@app/graphql/level-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const hooks_1 = require("@app/hooks");
const UpgradeTrialAccount = () => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { currentLevel } = (0, level_context_1.useLevel)();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const hasBalance = (0, show_warning_secure_account_hook_1.useShowWarningSecureAccount)();
    const [upgradeAccountModalVisible, setUpgradeAccountModalVisible] = (0, react_1.useState)(false);
    const [isContactModalVisible, setIsContactModalVisible] = (0, react_1.useState)(false);
    const { name: bankName } = appConfig.galoyInstance;
    const closeUpgradeAccountModal = () => setUpgradeAccountModalVisible(false);
    const openUpgradeAccountModal = () => setUpgradeAccountModalVisible(true);
    const toggleContactModal = () => setIsContactModalVisible(!isContactModalVisible);
    if (currentLevel === level_context_1.AccountLevel.Zero) {
        return (<>
        <upgrade_account_modal_1.UpgradeAccountModal isVisible={upgradeAccountModalVisible} closeModal={closeUpgradeAccountModal}/>
        <react_native_1.View style={styles.container}>
          <react_native_1.View style={styles.sideBySide}>
            <themed_1.Text type="h2" bold>
              {LL.common.trialAccount()}
            </themed_1.Text>
            <galoy_icon_1.GaloyIcon name="warning" size={30}/>
          </react_native_1.View>
          <themed_1.Text type="p3">{LL.AccountScreen.itsATrialAccount()}</themed_1.Text>
          {hasBalance && (<themed_1.Text type="p3">⚠️ {LL.AccountScreen.fundsMoreThan5Dollars()}</themed_1.Text>)}
          <galoy_secondary_button_1.GaloySecondaryButton title={LL.common.backupAccount()} iconName="caret-right" iconPosition="right" containerStyle={styles.selfCenter} onPress={openUpgradeAccountModal}/>
        </react_native_1.View>
      </>);
    }
    else if (currentLevel === level_context_1.AccountLevel.One) {
        const messageBody = LL.TransactionLimitsScreen.contactUsMessageBody({
            bankName,
        });
        const messageSubject = LL.TransactionLimitsScreen.contactUsMessageSubject();
        return (<>
        <buttons_1.PrimaryBtn label={LL.TransactionLimitsScreen.requestBusiness()} btnStyle={{ marginTop: 10 }} onPress={toggleContactModal}/>
        <contact_modal_1.default isVisible={isContactModalVisible} toggleModal={toggleContactModal} messageBody={messageBody} messageSubject={messageSubject} supportChannelsToHide={[
                contact_modal_1.SupportChannels.Mattermost,
                contact_modal_1.SupportChannels.StatusPage,
                contact_modal_1.SupportChannels.Discord,
            ]}/>
      </>);
    }
    else {
        return null;
    }
};
exports.UpgradeTrialAccount = UpgradeTrialAccount;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        borderRadius: 20,
        backgroundColor: colors.grey5,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        rowGap: 10,
    },
    selfCenter: { alignSelf: "center" },
    sideBySide: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        marginBottom: 4,
    },
}));
//# sourceMappingURL=upgrade-trial-account.js.map