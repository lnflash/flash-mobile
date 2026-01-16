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
const react_native_1 = require("react-native");
const native_1 = __importDefault(require("styled-components/native"));
const themed_1 = require("@rneui/themed");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const ReceiveTypeBottomSheet = ({ currency, type, disabled, onChange, }) => {
    var _a, _b, _c;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors, mode } = (0, themed_1.useTheme)().theme;
    const [modalVisible, setModalVisible] = (0, react_1.useState)(false);
    const bottom = (0, react_native_safe_area_context_1.useSafeAreaInsets)().bottom;
    const onChangeType = (type) => {
        onChange(type);
        setModalVisible(false);
    };
    let receivingTypes = [
        { key: "Lightning", title: "Lightning", icon: "flash", color: "#F0C243" },
        { key: "PayCode", title: "Paycode", icon: "at", color: "#E8D315" },
        { key: "OnChain", title: "Onchain ", icon: "logo-bitcoin", color: "#41AC48" },
    ];
    if (currency === "BTC") {
        receivingTypes = receivingTypes.filter((el) => el.key !== "PayCode");
    }
    return (<>
      <Btn onPress={() => setModalVisible(true)} style={{ flex: 1, borderColor: colors.border01 }} disabled={disabled}>
        <Row>
          <themed_1.Icon name={(_a = receivingTypes.find((el) => el.key === type)) === null || _a === void 0 ? void 0 : _a.icon} color={(_b = receivingTypes.find((el) => el.key === type)) === null || _b === void 0 ? void 0 : _b.color} size={25} style={{ marginRight: 5 }} type="ionicon"/>
          <themed_1.Text type="bl">{(_c = receivingTypes.find((el) => el.key === type)) === null || _c === void 0 ? void 0 : _c.title}</themed_1.Text>
        </Row>
        <themed_1.Icon name={modalVisible ? "chevron-up" : "chevron-down"} color={colors.icon01} type="ionicon"/>
      </Btn>
      <react_native_1.Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <Backdrop onPress={() => setModalVisible(false)} activeOpacity={1} mode={mode}>
          <Container pb={bottom} style={{ backgroundColor: colors.white }}>
            <TitleWrapper>
              <themed_1.Text type="h01">{LL.ReceiveScreen.selectPaymentMethod()}</themed_1.Text>
              <Close onPress={() => setModalVisible(false)}>
                <themed_1.Icon name={"close"} size={30} color={colors.black} type="ionicon"/>
              </Close>
            </TitleWrapper>
            {receivingTypes.map((el) => (<Btn key={el.key} onPress={() => onChangeType(el.key)} style={{
                justifyContent: "flex-start",
                borderColor: colors.border01,
                marginBottom: 10,
            }}>
                <themed_1.Icon name={el.icon} size={30} style={{ marginRight: 10 }} color={el.color} type="ionicon"/>
                <themed_1.Text type="bl">{el.title}</themed_1.Text>
              </Btn>))}
          </Container>
        </Backdrop>
      </react_native_1.Modal>
    </>);
};
exports.default = ReceiveTypeBottomSheet;
const Btn = native_1.default.TouchableOpacity `
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-radius: 15px;
  border-width: 1px;
  padding: 10px;
`;
const Row = native_1.default.View `
  flex-direction: row;
  align-items: center;
`;
const Backdrop = native_1.default.TouchableOpacity `
  flex: 1;
  justify-content: flex-end;
  background-color: ${({ mode }) => mode === "dark" ? "rgba(57,57,57,.7)" : "rgba(0,0,0,.5)"};
`;
const Container = native_1.default.View `
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding-bottom: ${({ pb }) => pb || 10}px;
  padding-top: 20px;
  padding-horizontal: 20px;
`;
const TitleWrapper = native_1.default.View `
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
`;
const Close = native_1.default.TouchableOpacity `
  padding: 5px;
`;
//# sourceMappingURL=ReceiveTypeBottomSheet.js.map