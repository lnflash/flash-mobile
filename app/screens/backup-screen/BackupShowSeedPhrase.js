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
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const Keychain = __importStar(require("react-native-keychain"));
const themed_1 = require("@rneui/themed");
// components
const buttons_1 = require("@app/components/buttons");
const BackupShowSeedPhrase = ({ navigation }) => {
    const bottom = (0, react_native_safe_area_context_1.useSafeAreaInsets)().bottom;
    const { colors } = (0, themed_1.useTheme)().theme;
    const { mode } = (0, themed_1.useThemeMode)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [seedPhrase, setSeedPhrase] = (0, react_1.useState)([]);
    (0, react_1.useEffect)(() => {
        getSeedPhrase();
    }, []);
    const getSeedPhrase = async () => {
        const credentials = await Keychain.getInternetCredentials("mnemonic_key");
        if (credentials) {
            setSeedPhrase(credentials.password.split(" "));
        }
    };
    const onDone = () => {
        navigation.navigate("BackupOptions");
    };
    const renderItemHandler = ({ item, index }) => {
        return (<SeedPhrase style={{ backgroundColor: mode === "dark" ? "#5b5b5b" : "#ededed" }} marginRight={index % 2 === 0}>
        <SeedPhraseNum style={{ borderRightColor: colors.white }}>
          <themed_1.Text type="p1" bold>
            {index + 1}
          </themed_1.Text>
        </SeedPhraseNum>
        <SeedPhraseText>
          <themed_1.Text type="p1" bold>
            {item}
          </themed_1.Text>
        </SeedPhraseText>
      </SeedPhrase>);
    };
    return (<Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <themed_1.Text type="h01" bold style={{ textAlign: "center" }}>
          {LL.BackupShowSeedPhrase.title()}
        </themed_1.Text>
        <themed_1.Text type="p1" color={colors.grey2} style={{ textAlign: "center" }}>
          {LL.BackupShowSeedPhrase.description()}
        </themed_1.Text>
        <react_native_1.FlatList data={seedPhrase} numColumns={2} renderItem={renderItemHandler} columnWrapperStyle={{ justifyContent: "space-between" }} scrollEnabled={false} style={{ marginVertical: 20 }}/>
      </Container>
      <buttons_1.PrimaryBtn label={LL.BackupShowSeedPhrase.done()} onPress={onDone} btnStyle={{ marginBottom: bottom || 10 }}/>
    </Wrapper>);
};
exports.default = BackupShowSeedPhrase;
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
  margin-right: ${({ marginRight }) => (marginRight ? 15 : 0)}px;
`;
const SeedPhraseNum = native_1.default.View `
  width: 50px;
  align-items: center;
  border-right-width: 2px;
  padding-left: 5px;
  padding-vertical: 14px;
`;
const SeedPhraseText = native_1.default.View `
  flex: 1;
  padding-horizontal: 15px;
`;
//# sourceMappingURL=BackupShowSeedPhrase.js.map