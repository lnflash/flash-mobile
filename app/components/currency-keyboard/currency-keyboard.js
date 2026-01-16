"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyKeyboard = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// utils
const number_pad_reducer_1 = require("../amount-input-screen/number-pad-reducer");
const testProps_1 = require("@app/utils/testProps");
const height = react_native_1.Dimensions.get("screen").height;
const CurrencyKeyboard = ({ onPress }) => {
    return (<react_native_1.View>
      <react_native_1.View style={{ flexDirection: "row" }}>
        <Key numberPadKey={number_pad_reducer_1.Key[1]} handleKeyPress={onPress}/>
        <Key numberPadKey={number_pad_reducer_1.Key[2]} handleKeyPress={onPress}/>
        <Key numberPadKey={number_pad_reducer_1.Key[3]} handleKeyPress={onPress}/>
      </react_native_1.View>
      <react_native_1.View style={{ flexDirection: "row" }}>
        <Key numberPadKey={number_pad_reducer_1.Key[4]} handleKeyPress={onPress}/>
        <Key numberPadKey={number_pad_reducer_1.Key[5]} handleKeyPress={onPress}/>
        <Key numberPadKey={number_pad_reducer_1.Key[6]} handleKeyPress={onPress}/>
      </react_native_1.View>
      <react_native_1.View style={{ flexDirection: "row" }}>
        <Key numberPadKey={number_pad_reducer_1.Key[7]} handleKeyPress={onPress}/>
        <Key numberPadKey={number_pad_reducer_1.Key[8]} handleKeyPress={onPress}/>
        <Key numberPadKey={number_pad_reducer_1.Key[9]} handleKeyPress={onPress}/>
      </react_native_1.View>
      <react_native_1.View style={{ flexDirection: "row" }}>
        <Key numberPadKey={number_pad_reducer_1.Key.Decimal} handleKeyPress={onPress}/>
        <Key numberPadKey={number_pad_reducer_1.Key[0]} handleKeyPress={onPress}/>
        <Key numberPadKey={number_pad_reducer_1.Key.Backspace} handleKeyPress={onPress}/>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.CurrencyKeyboard = CurrencyKeyboard;
const Key = ({ handleKeyPress, numberPadKey, }) => {
    const { mode } = (0, themed_1.useTheme)().theme;
    const pressableStyle = ({ pressed }) => {
        const baseStyle = {
            flex: 1,
            height: height / 9.5,
            alignItems: "center",
            justifyContent: "center",
        };
        if (pressed) {
            return Object.assign(Object.assign({}, baseStyle), { backgroundColor: mode === "dark" ? "#002118" : "#DDE3E1" });
        }
        return baseStyle;
    };
    return (<react_native_1.Pressable style={pressableStyle} onPress={() => handleKeyPress(numberPadKey)} {...(0, testProps_1.testProps)(`Key ${numberPadKey}`)}>
      <themed_1.Text type="h02" bold>
        {numberPadKey}
      </themed_1.Text>
    </react_native_1.Pressable>);
};
//# sourceMappingURL=currency-keyboard.js.map