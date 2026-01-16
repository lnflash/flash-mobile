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
const native_1 = __importDefault(require("styled-components/native"));
const themed_1 = require("@rneui/themed");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const persistent_state_1 = require("@app/store/persistent-state");
const themed_2 = require("@rneui/themed");
// components
const buttons_1 = require("@app/components/buttons");
const upgrade_account_modal_1 = require("@app/components/upgrade-account-modal");
// utils
const secureStorage_1 = __importDefault(require("@app/utils/storage/secureStorage"));
const biometricAuthentication_1 = __importDefault(require("@app/utils/biometricAuthentication"));
const enum_1 = require("@app/utils/enum");
// graphql
const generated_1 = require("@app/graphql/generated");
const level_context_1 = require("@app/graphql/level-context");
const BackupOptions = ({ navigation }) => {
    var _a, _b, _c, _d, _e, _f;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_2.useTheme)().theme;
    const { bottom } = (0, react_native_safe_area_context_1.useSafeAreaInsets)();
    const { isAtLeastLevelZero } = (0, level_context_1.useLevel)();
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const [upgradeAccountModalVisible, setUpgradeAccountModalVisible] = (0, react_1.useState)(false);
    const { data } = (0, generated_1.useAccountScreenQuery)({
        fetchPolicy: "cache-and-network",
        skip: !isAtLeastLevelZero,
    });
    const onBackupBTCWallet = async () => {
        if (!persistentState.backedUpBtcWallet) {
            navigation.navigate("BackupStart");
        }
        else {
            const isPinEnabled = await secureStorage_1.default.getIsPinEnabled();
            const isSensorAvailable = await biometricAuthentication_1.default.isSensorAvailable();
            const getIsBiometricsEnabled = await secureStorage_1.default.getIsBiometricsEnabled();
            if (isSensorAvailable && getIsBiometricsEnabled) {
                navigation.navigate("authentication", {
                    screenPurpose: enum_1.AuthenticationScreenPurpose.ShowSeedPhrase,
                    isPinEnabled,
                });
            }
            else if (isPinEnabled) {
                navigation.navigate("pin", { screenPurpose: enum_1.PinScreenPurpose.ShowSeedPhrase });
            }
            else {
                navigation.navigate("BackupShowSeedPhrase");
            }
        }
    };
    const onBackupUSDWallet = () => {
        setUpgradeAccountModalVisible(true);
    };
    return (<Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <themed_1.Text type="h02" bold style={{ textAlign: "center", marginBottom: 30 }}>
          {LL.BackupOptions.title()}
        </themed_1.Text>
        {persistentState.isAdvanceMode && (<Btn onPress={onBackupBTCWallet}>
            <themed_1.Icon type="ionicon" name={persistentState.backedUpBtcWallet
                ? "checkmark-circle"
                : "checkmark-circle-outline"} color={persistentState.backedUpBtcWallet ? colors.primary : colors.icon02} size={40}/>
            <BtnTextWrapper>
              <themed_1.Text type="p1">
                {persistentState.backedUpBtcWallet
                ? LL.BackupOptions.revealRecoveryPhrase()
                : LL.BackupOptions.recoveryPhrase()}
              </themed_1.Text>
              <themed_1.Text type="p3" color={colors.grey2}>
                {persistentState.backedUpBtcWallet
                ? LL.BackupOptions.revealRecoveryPhraseDesc()
                : LL.BackupOptions.recoveryPhraseDesc()}
              </themed_1.Text>
            </BtnTextWrapper>
            <themed_1.Icon type="ionicon" name={"chevron-forward"} size={20}/>
          </Btn>)}
        <Btn onPress={onBackupUSDWallet} disabled={!!((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.phone)}>
          <themed_1.Icon type="ionicon" name={!!((_b = data === null || data === void 0 ? void 0 : data.me) === null || _b === void 0 ? void 0 : _b.phone) ? "checkmark-circle" : "checkmark-circle-outline"} color={!!((_c = data === null || data === void 0 ? void 0 : data.me) === null || _c === void 0 ? void 0 : _c.phone) ? colors.primary : colors.icon02} size={40}/>
          <BtnTextWrapper>
            <themed_1.Text type="p1">{LL.BackupOptions.phone()}</themed_1.Text>
            <themed_1.Text type="p3" color={colors.grey2}>
              {!!((_d = data === null || data === void 0 ? void 0 : data.me) === null || _d === void 0 ? void 0 : _d.phone)
            ? LL.BackupOptions.usePhoneNumber().replace("yourNumber", (_e = data === null || data === void 0 ? void 0 : data.me) === null || _e === void 0 ? void 0 : _e.phone)
            : LL.BackupOptions.phoneDesc()}
            </themed_1.Text>
          </BtnTextWrapper>
          {!((_f = data === null || data === void 0 ? void 0 : data.me) === null || _f === void 0 ? void 0 : _f.phone) && <themed_1.Icon type="ionicon" name={"chevron-forward"} size={20}/>}
        </Btn>
      </Container>
      <buttons_1.PrimaryBtn label={LL.BackupOptions.done()} onPress={() => navigation.popToTop()} btnStyle={{ marginBottom: bottom || 10 }}/>
      <upgrade_account_modal_1.UpgradeAccountModal isVisible={upgradeAccountModalVisible} closeModal={() => setUpgradeAccountModalVisible(false)}/>
    </Wrapper>);
};
exports.default = BackupOptions;
const Wrapper = native_1.default.View `
  flex: 1;
  justify-content: space-between;
  padding-horizontal: 20px;
`;
const Container = native_1.default.View ``;
const Btn = native_1.default.TouchableOpacity `
  flex-direction: row;
  align-items: center;
  border-radius: 20px;
  border: 1px solid #dedede;
  margin-bottom: 20px;
  padding-vertical: 20px;
  padding-horizontal: 20px;
`;
const BtnTextWrapper = native_1.default.View `
  flex: 1;
  row-gap: 5px;
  margin-horizontal: 15px;
`;
//# sourceMappingURL=BackupOptions.js.map