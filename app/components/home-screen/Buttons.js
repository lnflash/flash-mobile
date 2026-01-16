"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const native_1 = __importDefault(require("styled-components/native"));
// hooks
const generated_1 = require("@app/graphql/generated");
const level_context_1 = require("@app/graphql/level-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_2 = require("@react-navigation/native");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const persistent_state_1 = require("@app/store/persistent-state");
// components
const buttons_1 = require("../buttons");
const Buttons = ({ setModalVisible, setDefaultAccountModalVisible }) => {
    const navigation = (0, native_2.useNavigation)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { currentLevel } = (0, level_context_1.useLevel)();
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const { data } = (0, generated_1.useHasPromptedSetDefaultAccountQuery)();
    const onMenuClick = (target) => {
        if (!isAuthed) {
            setModalVisible(true);
        }
        else {
            if (target === "receiveBitcoin" &&
                !(data === null || data === void 0 ? void 0 : data.hasPromptedSetDefaultAccount) &&
                persistentState.isAdvanceMode) {
                setDefaultAccountModalVisible(true);
            }
            else {
                navigation.navigate(target);
            }
        }
    };
    const buttons = [
        {
            title: LL.HomeScreen.send(),
            target: "sendBitcoinDestination",
            icon: "up",
        },
        {
            title: LL.HomeScreen.receive(),
            target: "receiveBitcoin",
            icon: "down",
        },
    ];
    if (persistentState.isAdvanceMode) {
        buttons.push({
            title: LL.ConversionDetailsScreen.title(),
            target: "conversionDetails",
            icon: "swap",
        });
    }
    // if (currentLevel === AccountLevel.Two) {
    //   buttons.push({
    //     title: LL.Cashout.title(),
    //     target: "CashoutDetails",
    //     icon: "dollar",
    //   })
    // }
    return (<Wrapper>
      {buttons.map((item) => (<buttons_1.IconBtn key={item.title} type="clear" icon={item.icon} label={item.title} onPress={() => onMenuClick(item.target)}/>))}
    </Wrapper>);
};
exports.default = Buttons;
const Wrapper = native_1.default.View `
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
`;
//# sourceMappingURL=Buttons.js.map