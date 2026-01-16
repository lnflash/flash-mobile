"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const native_1 = __importDefault(require("styled-components/native"));
const themed_1 = require("@rneui/themed");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const persistent_state_1 = require("@app/store/persistent-state");
const ImportWalletOptions = ({ navigation, route }) => {
    var _a;
    const insideApp = (_a = route.params) === null || _a === void 0 ? void 0 : _a.insideApp;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { isAdvanceMode } = (0, persistent_state_1.usePersistentStateContext)().persistentState;
    const onImportBTCWallet = () => {
        navigation.navigate("ImportWallet", {
            insideApp,
        });
    };
    const onLoginWithPhone = () => {
        navigation.navigate("phoneFlow");
    };
    const onLoginWithEmail = () => {
        navigation.navigate("emailLoginInitiate");
    };
    const onLoginWithQRCode = () => {
        navigation.navigate("SignInViaQRCode");
    };
    return (<Wrapper style={{ backgroundColor: colors.white }}>
      <themed_1.Text type="h02" bold style={{ textAlign: "center", marginBottom: 30 }}>
        {insideApp
            ? LL.ImportWalletOptions.importOptions()
            : LL.ImportWalletOptions.loginOptions()}
      </themed_1.Text>

      {isAdvanceMode && (<Btn onPress={onImportBTCWallet}>
          <themed_1.Icon type="ionicon" size={40} name={"apps"} color={colors.icon02}/>
          <BtnTextWrapper>
            <themed_1.Text type="p1">{LL.ImportWalletOptions.recoveryPhrase()}</themed_1.Text>
            <themed_1.Text type="p3" color={colors.grey2}>
              {LL.ImportWalletOptions.importBTCWallet()}
            </themed_1.Text>
          </BtnTextWrapper>
          <themed_1.Icon type="ionicon" name={"chevron-forward"} size={20}/>
        </Btn>)}
      {!insideApp && (<>
          <Btn onPress={onLoginWithPhone}>
            <themed_1.Icon type="ionicon" name={"mail"} color={colors.icon02} size={40}/>
            <BtnTextWrapper>
              <themed_1.Text type="p1">{LL.ImportWalletOptions.phone()}</themed_1.Text>
              <themed_1.Text type="p3" color={colors.grey2}>
                {LL.ImportWalletOptions.importUsingPhone()}
              </themed_1.Text>
            </BtnTextWrapper>
            <themed_1.Icon type="ionicon" name={"chevron-forward"} size={20}/>
          </Btn>
          <Btn onPress={onLoginWithEmail}>
            <themed_1.Icon type="ionicon" name={"at"} color={colors.icon02} size={40}/>
            <BtnTextWrapper>
              <themed_1.Text type="p1">{LL.ImportWalletOptions.email()}</themed_1.Text>
              <themed_1.Text type="p3" color={colors.grey2}>
                {LL.ImportWalletOptions.importUsingEmail()}
              </themed_1.Text>
            </BtnTextWrapper>
            <themed_1.Icon type="ionicon" name={"chevron-forward"} size={20}/>
          </Btn>
          <Btn onPress={onLoginWithQRCode}>
            <themed_1.Icon type="ionicon" name={"qr-code"} color={colors.icon02} size={40}/>
            <BtnTextWrapper>
              <themed_1.Text type="p1">Sign In with QR code</themed_1.Text>
              <themed_1.Text type="p3" color={colors.grey2}>
                Import your account by scanning a QR code from your old phone.{" "}
              </themed_1.Text>
            </BtnTextWrapper>
            <themed_1.Icon type="ionicon" name={"chevron-forward"} size={20}/>
          </Btn>
        </>)}
    </Wrapper>);
};
exports.default = ImportWalletOptions;
const Wrapper = native_1.default.View `
  flex: 1;
  padding-horizontal: 20px;
`;
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
//# sourceMappingURL=ImportWalletOptions.js.map