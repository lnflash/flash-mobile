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
const react_native_1 = require("react-native");
const Keychain = __importStar(require("react-native-keychain"));
const bip39 = __importStar(require("bip39"));
// components
const buttons_1 = require("@app/components/buttons");
const ActivityIndicatorContext_1 = require("@app/contexts/ActivityIndicatorContext");
// hooks
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const useCreateAccount_1 = require("@app/hooks/useCreateAccount");
const themed_1 = require("@rneui/themed");
const persistent_state_1 = require("@app/store/persistent-state");
// utils
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const KEYCHAIN_MNEMONIC_KEY = "mnemonic_key";
const ImportWallet = ({ navigation, route }) => {
    var _a;
    const insideApp = (_a = route.params) === null || _a === void 0 ? void 0 : _a.insideApp;
    const bottom = (0, react_native_safe_area_context_1.useSafeAreaInsets)().bottom;
    const { colors } = (0, themed_1.useTheme)().theme;
    const { mode } = (0, themed_1.useThemeMode)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const { createDeviceAccountAndLogin } = (0, useCreateAccount_1.useCreateAccount)();
    const inputRef = (0, react_1.useRef)([]);
    const [inputSeedPhrase, setInputSeedPhrase] = (0, react_1.useState)(Array(12).fill(""));
    const [loading, setLoading] = (0, react_1.useState)(false);
    const onComplete = async () => {
        setLoading(true);
        updateStateHandler(false);
        const mnemonicKey = inputSeedPhrase.join(" ").toLowerCase();
        const res = bip39.validateMnemonic(mnemonicKey);
        if (res) {
            if (insideApp) {
                await (0, breez_sdk_liquid_1.disconnectToSDK)();
                await Keychain.setInternetCredentials(KEYCHAIN_MNEMONIC_KEY, KEYCHAIN_MNEMONIC_KEY, mnemonicKey);
                await (0, breez_sdk_liquid_1.initializeBreezSDK)();
                setTimeout(() => {
                    updateStateHandler(true);
                    setLoading(false);
                    navigation.reset({ index: 0, routes: [{ name: "Primary" }] });
                }, 5000);
            }
            else {
                // const token: any = await createDeviceAccountAndLogin()
                // if (route.params?.onComplete) {
                //   route.params?.onComplete(token)
                // }
            }
        }
        else {
            setLoading(false);
            react_native_1.Alert.alert("Invalid recovery phrase");
        }
    };
    const updateStateHandler = (isAdvanceMode) => {
        updateState((state) => {
            if (state)
                return Object.assign(Object.assign({}, state), { btcTransactions: [], breezBalance: undefined, btcBalance: undefined, convertedBtcBalance: undefined, isAdvanceMode });
            return undefined;
        });
    };
    const renderItemHandler = ({ index }) => {
        return (<SeedPhrase style={{ backgroundColor: mode === "dark" ? "#5b5b5b" : "#ededed" }}>
        <SeedPhraseNum style={{ borderRightColor: colors.white }}>
          <themed_1.Text type="p1" bold>
            {index + 1}
          </themed_1.Text>
        </SeedPhraseNum>
        <SeedPhraseText>
          <Input 
        // @ts-ignore
        ref={(el) => (inputRef.current[index] = el)} value={inputSeedPhrase[index]} autoCapitalize="none" blurOnSubmit={false} onChangeText={(text) => {
                const updatedInput = [...inputSeedPhrase];
                updatedInput[index] = text;
                setInputSeedPhrase(updatedInput);
            }} onSubmitEditing={() => {
                if (index === 11) {
                    inputRef.current[index].blur();
                }
                else {
                    inputRef.current[index + 1].focus();
                }
            }} returnKeyType={index === 11 ? "done" : "next"} style={{ color: colors.black }}/>
        </SeedPhraseText>
      </SeedPhrase>);
    };
    const disabled = inputSeedPhrase.findIndex((el) => el === "") !== -1;
    return (<Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <themed_1.Text type="h01" bold style={{ textAlign: "center" }}>
          {insideApp ? LL.ImportWallet.importTitle() : LL.ImportWallet.title()}
        </themed_1.Text>
        <themed_1.Text type="p1" color={colors.grey2} style={{ textAlign: "center" }}>
          {LL.ImportWallet.description()}
        </themed_1.Text>
        <react_native_1.FlatList data={inputSeedPhrase} numColumns={2} renderItem={renderItemHandler} columnWrapperStyle={{ justifyContent: "space-between", columnGap: 15 }} scrollEnabled={false} style={{ marginVertical: 20 }}/>
      </Container>
      <buttons_1.PrimaryBtn label={LL.ImportWallet.complete()} disabled={disabled} loading={loading} onPress={onComplete} btnStyle={{ marginBottom: bottom || 10 }}/>
      {loading && <ActivityIndicatorContext_1.Loading />}
    </Wrapper>);
};
exports.default = ImportWallet;
const Wrapper = native_1.default.View `
  flex: 1;
  justify-content: space-between;
  padding-horizontal: 20px;
`;
const Container = native_1.default.View `
  row-gap: 10px;
`;
const SeedPhrase = native_1.default.View `
  flex: 1;
  flex-direction: row;
  align-items: center;
  border-radius: 20px;
  margin-bottom: 10px;
  overflow: hidden;
`;
const SeedPhraseNum = native_1.default.View `
  width: 50px;
  height: 46px;
  align-items: center;
  justify-content: center;
  border-right-width: 2px;
`;
const SeedPhraseText = native_1.default.View `
  flex: 1;
  align-items: center;
`;
const Input = native_1.default.TextInput `
  width: 100%;
  height: 46px;
  font-size: 18px;
  font-weight: 600;
  font-family: "Sora-Bold";
  padding-horizontal: 5px;
`;
//# sourceMappingURL=ImportWallet.js.map