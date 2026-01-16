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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Screen = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const screen_presets_1 = require("./screen.presets");
const helper_1 = require("../../utils/helper");
const themed_1 = require("@rneui/themed");
function ScreenWithoutScrolling(props) {
    const { theme: { mode, colors }, } = (0, themed_1.useTheme)();
    const statusBarContent = mode === "light" ? "dark-content" : "light-content";
    const preset = screen_presets_1.presets.fixed;
    const style = props.style || {};
    const backgroundStyle = props.backgroundColor
        ? { backgroundColor: props.backgroundColor }
        : { backgroundColor: colors.white };
    const Wrapper = props.unsafe ? react_native_1.View : react_native_1.SafeAreaView;
    return (<react_native_1.KeyboardAvoidingView style={[preset.outer, backgroundStyle]} behavior={helper_1.isIos ? "padding" : undefined} keyboardVerticalOffset={screen_presets_1.offsets[props.keyboardOffset || "none"]}>
      <Wrapper style={[preset.inner, style]}>{props.children}</Wrapper>
    </react_native_1.KeyboardAvoidingView>);
}
function ScreenWithScrolling(props) {
    const { theme: { mode, colors }, } = (0, themed_1.useTheme)();
    const statusBarContent = mode === "light" ? "dark-content" : "light-content";
    const preset = screen_presets_1.presets.scroll;
    const style = props.style || {};
    const backgroundStyle = props.backgroundColor
        ? { backgroundColor: props.backgroundColor }
        : { backgroundColor: colors.white };
    const Wrapper = props.unsafe ? react_native_1.View : react_native_1.SafeAreaView;
    return (<react_native_1.KeyboardAvoidingView style={[preset.outer, backgroundStyle]} behavior={helper_1.isIos ? "padding" : undefined} keyboardVerticalOffset={screen_presets_1.offsets[props.keyboardOffset || "none"]}>
      <Wrapper style={[preset.outer, backgroundStyle]}>
        <react_native_1.ScrollView style={[preset.outer, backgroundStyle]} contentContainerStyle={[preset.inner, style]} keyboardShouldPersistTaps={props.keyboardShouldPersistTaps}>
          {props.children}
        </react_native_1.ScrollView>
      </Wrapper>
    </react_native_1.KeyboardAvoidingView>);
}
/**
 * The starting component on every screen in the app.
 *
 * @param props The screen props
 */
const Screen = (props) => {
    if ((0, screen_presets_1.isNonScrolling)(props.preset)) {
        return <ScreenWithoutScrolling {...props}/>;
    }
    return <ScreenWithScrolling {...props}/>;
};
exports.Screen = Screen;
//# sourceMappingURL=screen.js.map