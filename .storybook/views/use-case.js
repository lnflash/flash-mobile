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
exports.UseCase = void 0;
const themed_1 = require("@rneui/themed");
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const TITLE = { fontWeight: "600" };
const USE_CASE_WRAPPER = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderTopColor: "#e6e6e6",
    borderTopWidth: 1,
    flexDirection: "row",
};
const USE_CASE = {
    fontSize: 10,
    paddingHorizontal: 4,
    paddingBottom: 2,
};
const USAGE = { fontSize: 10, paddingTop: 0 };
const HEADER = {
    paddingTop: 20,
    paddingBottom: 10,
    paddingHorizontal: 10,
    borderBottomColor: "#e6e6e6",
    borderBottomWidth: 1,
};
const UseCase = (props) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const backgroundColor = { backgroundColor: colors.white };
    const style = Object.assign(Object.assign({}, Object.assign({ padding: props.noPad ? 0 : 10 }, backgroundColor)), props.style);
    return (<>
      <react_native_1.View style={[HEADER, Object.assign({}, backgroundColor)]}>
        <react_native_1.View style={USE_CASE_WRAPPER}>
          <themed_1.Text style={USE_CASE}>Use Case</themed_1.Text>
        </react_native_1.View>
        <react_native_1.View>
          <themed_1.Text style={TITLE}>{props.text}</themed_1.Text>
        </react_native_1.View>
        {props.usage ? <themed_1.Text style={USAGE}>{props.usage}</themed_1.Text> : null}
      </react_native_1.View>
      <react_native_1.View style={style}>{props.children}</react_native_1.View>
    </>);
};
exports.UseCase = UseCase;
//# sourceMappingURL=use-case.js.map