"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GaloyAddressScreen = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const client_1 = require("@apollo/client");
const screen_1 = require("@app/components/screen");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const pay_links_1 = require("@app/utils/pay-links");
const themed_1 = require("@rneui/themed");
const generated_1 = require("../../graphql/generated");
const address_component_1 = __importDefault(require("./address-component"));
const address_explainer_modal_1 = require("./address-explainer-modal");
const paycode_explainer_modal_1 = require("./paycode-explainer-modal");
const pos_explainer_modal_1 = require("./pos-explainer-modal");
const useStyles = (0, themed_1.makeStyles)(() => ({
    container: {
        padding: 20,
    },
    addressInfoContainer: {
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 32,
        rowGap: 60,
    },
    buttonContainerStyle: {
        marginTop: 20,
    },
}));
(0, client_1.gql) `
  query addressScreen {
    me {
      id
      username
    }
  }
`;
const GaloyAddressScreen = () => {
    var _a;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const styles = useStyles();
    const { data } = (0, generated_1.useAddressScreenQuery)({
        fetchPolicy: "cache-first",
        skip: !isAuthed,
    });
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const { name: bankName } = appConfig.galoyInstance;
    const [explainerModalVisible, setExplainerModalVisible] = react_1.default.useState(false);
    const [isPosExplainerModalOpen, setIsPosExplainerModalOpen] = react_1.default.useState(false);
    const [isPaycodeExplainerModalOpen, setIsPaycodeExplainerModalOpen] = react_1.default.useState(false);
    const username = ((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username) || "";
    const lightningAddress = (0, pay_links_1.getLightningAddress)(appConfig.galoyInstance.lnAddressHostname, username);
    const posUrl = (0, pay_links_1.getPosUrl)(appConfig.galoyInstance.posUrl, username);
    const payCodeUrl = (0, pay_links_1.getPrintableQrCodeUrl)(appConfig.galoyInstance.posUrl, username);
    const togglePosExplainerModal = () => {
        setIsPosExplainerModalOpen(!isPosExplainerModalOpen);
    };
    const togglePaycodeExplainerModal = () => {
        setIsPaycodeExplainerModalOpen(!isPaycodeExplainerModalOpen);
    };
    const toggleExplainerModal = () => {
        setExplainerModalVisible(!explainerModalVisible);
    };
    return (<screen_1.Screen preset="scroll">
      <react_native_1.View style={styles.container}>
        {username && (<>
            <themed_1.Text type={"h1"} bold>
              {LL.GaloyAddressScreen.title()}
            </themed_1.Text>
            <react_native_1.View style={styles.addressInfoContainer}>
              <address_component_1.default addressType={"lightning"} address={lightningAddress} title={LL.GaloyAddressScreen.yourAddress({ bankName })} onToggleDescription={toggleExplainerModal}/>
              <address_component_1.default addressType={"pos"} address={posUrl} title={LL.GaloyAddressScreen.yourCashRegister()} useGlobeIcon={true} onToggleDescription={togglePosExplainerModal}/>
              <address_component_1.default addressType={"paycode"} address={payCodeUrl} title={LL.GaloyAddressScreen.yourPaycode()} useGlobeIcon={true} onToggleDescription={togglePaycodeExplainerModal}/>
            </react_native_1.View>
          </>)}
      </react_native_1.View>
      <address_explainer_modal_1.AddressExplainerModal modalVisible={explainerModalVisible} toggleModal={toggleExplainerModal}/>
      <pos_explainer_modal_1.PosExplainerModal modalVisible={isPosExplainerModalOpen} toggleModal={togglePosExplainerModal}/>
      <paycode_explainer_modal_1.PayCodeExplainerModal modalVisible={isPaycodeExplainerModalOpen} toggleModal={togglePaycodeExplainerModal}/>
    </screen_1.Screen>);
};
exports.GaloyAddressScreen = GaloyAddressScreen;
//# sourceMappingURL=address-screen.js.map