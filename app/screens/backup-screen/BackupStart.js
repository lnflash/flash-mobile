"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const native_1 = __importDefault(require("styled-components/native"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const themed_1 = require("@rneui/themed");
// components
const buttons_1 = require("@app/components/buttons");
const BackupStart = ({ navigation }) => {
    const bottom = (0, react_native_safe_area_context_1.useSafeAreaInsets)().bottom;
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const onContinue = () => {
        navigation.navigate("BackupSeedPhrase");
    };
    return (<Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <themed_1.Text type="h01" bold style={{ textAlign: "center" }}>
          {LL.BackupStart.title()}
        </themed_1.Text>
        <themed_1.Text type="p1" color={colors.grey2} style={{ textAlign: "center" }}>
          {LL.BackupStart.description()}
        </themed_1.Text>
      </Container>
      <buttons_1.PrimaryBtn label={LL.BackupStart.continue()} onPress={onContinue} btnStyle={{ marginBottom: bottom || 10 }}/>
    </Wrapper>);
};
exports.default = BackupStart;
const Wrapper = native_1.default.View `
  flex: 1;
  justify-content: space-between;
  padding-horizontal: 20px;
`;
const Container = native_1.default.View `
  row-gap: 10px;
`;
//# sourceMappingURL=BackupStart.js.map