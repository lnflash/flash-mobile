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
const BackupVerify = ({ navigation }) => {
    const bottom = (0, react_native_safe_area_context_1.useSafeAreaInsets)().bottom;
    const { colors } = (0, themed_1.useTheme)().theme;
    const { mode } = (0, themed_1.useThemeMode)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [selectOrder, setSelectOrder] = (0, react_1.useState)(0);
    const [shuffledSeedPhrase, setShuffledSeedPhrase] = (0, react_1.useState)([]);
    (0, react_1.useEffect)(() => {
        getSeedPhrase();
    }, []);
    const getSeedPhrase = async () => {
        const credentials = await Keychain.getInternetCredentials("mnemonic_key");
        if (credentials) {
            const phrases = credentials.password
                .split(" ")
                .map((el, index) => ({
                key: el,
                order: index,
                selectedInOrder: undefined,
            }));
            shuffleSeedPhrase(phrases);
        }
    };
    const shuffleSeedPhrase = (array) => {
        let currentIndex = array.length, randomIndex;
        while (currentIndex > 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [
                array[randomIndex],
                array[currentIndex],
            ];
        }
        setSelectOrder(0);
        setShuffledSeedPhrase(array.map((el) => (Object.assign(Object.assign({}, el), { selectedInOrder: undefined }))));
    };
    const onSelect = (item, index) => {
        const updatedShuffledSeedPhrase = [...shuffledSeedPhrase];
        let updatedSelectOrder = selectOrder;
        if (item.order === selectOrder) {
            updatedShuffledSeedPhrase[index].selectedInOrder = true;
            updatedSelectOrder++;
        }
        else {
            updatedShuffledSeedPhrase[index].selectedInOrder = false;
            updatedSelectOrder++;
        }
        setShuffledSeedPhrase(updatedShuffledSeedPhrase);
        setSelectOrder(updatedSelectOrder);
    };
    const onContinue = () => {
        navigation.navigate("BackupComplete");
    };
    let wrongSelect = false;
    shuffledSeedPhrase.forEach((el) => {
        if (el.selectedInOrder === false) {
            wrongSelect = true;
        }
    });
    const renderItemHandler = ({ item, index, }) => {
        return (<SeedPhrase onPress={() => onSelect(item, index)} disabled={wrongSelect || item.selectedInOrder} style={{ backgroundColor: mode === "dark" ? "#5b5b5b" : "#ededed" }} marginRight={index % 2 === 0}>
        <SeedPhraseNum style={{ borderRightColor: colors.white }} selectedInOrder={item.selectedInOrder}>
          <themed_1.Text type="p1" bold>
            {item.selectedInOrder !== undefined
                ? item.selectedInOrder
                    ? item.order + 1
                    : selectOrder
                : ""}
          </themed_1.Text>
        </SeedPhraseNum>
        <SeedPhraseText>
          <themed_1.Text type="p1" bold>
            {item.key}
          </themed_1.Text>
        </SeedPhraseText>
      </SeedPhrase>);
    };
    return (<Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <themed_1.Text type="h01" bold style={{ textAlign: "center" }}>
          {selectOrder === 12 && !wrongSelect
            ? LL.BackupVerify.correctTitle()
            : wrongSelect
                ? LL.BackupVerify.wrongTitle()
                : LL.BackupVerify.title()}
        </themed_1.Text>
        <react_native_1.FlatList data={shuffledSeedPhrase} numColumns={2} renderItem={renderItemHandler} columnWrapperStyle={{ justifyContent: "space-between" }} scrollEnabled={false} style={{ marginVertical: 20 }}/>
      </Container>
      <ButtonsWrapper>
        <buttons_1.PrimaryBtn type="outline" label={LL.BackupVerify.tryAgain()} onPress={() => shuffleSeedPhrase(shuffledSeedPhrase)} btnStyle={{ marginBottom: 20 }}/>
        <buttons_1.PrimaryBtn label={LL.BackupVerify.continue()} disabled={!(selectOrder === 12 && !wrongSelect)} onPress={onContinue} btnStyle={{ marginBottom: bottom || 10 }}/>
      </ButtonsWrapper>
    </Wrapper>);
};
exports.default = BackupVerify;
const Wrapper = native_1.default.View `
  flex: 1;
  justify-content: space-between;
`;
const Container = native_1.default.View `
  row-gap: 10px;
  padding-horizontal: 20px;
`;
const SeedPhrase = native_1.default.TouchableOpacity `
  flex: 1;
  flex-direction: row;
  align-items: center;
  border-radius: 20px;
  margin-bottom: 10px;
  margin-right: ${({ marginRight }) => (marginRight ? 15 : 0)}px;
  overflow: hidden;
`;
const SeedPhraseNum = native_1.default.View `
  width: 50px;
  height: 100%;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  border-right-width: 2px;
  padding-left: 5px;
  background-color: ${({ selectedInOrder }) => selectedInOrder === undefined
    ? "transparent"
    : selectedInOrder
        ? "#34C571"
        : "#EB5757"};
`;
const SeedPhraseText = native_1.default.View `
  flex: 1;
  padding-horizontal: 15px;
  padding-vertical: 14px;
`;
const ButtonsWrapper = native_1.default.View `
  padding-top: 10px;
  padding-horizontal: 20px;
`;
//# sourceMappingURL=BackupVerify.js.map