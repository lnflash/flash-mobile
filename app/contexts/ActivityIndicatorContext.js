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
exports.Loading = exports.ActivityIndicatorProvider = exports.ActivityIndicatorContext = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const native_1 = __importDefault(require("styled-components/native"));
exports.ActivityIndicatorContext = (0, react_1.createContext)({
    toggleActivityIndicator: () => { },
    loadableVisible: false,
});
const ActivityIndicatorProvider = ({ children }) => {
    const [visible, toggleActivityIndicator] = (0, react_1.useState)(false);
    return (<exports.ActivityIndicatorContext.Provider value={{ loadableVisible: visible, toggleActivityIndicator }}>
      {children}
      {visible && <exports.Loading />}
    </exports.ActivityIndicatorContext.Provider>);
};
exports.ActivityIndicatorProvider = ActivityIndicatorProvider;
const Loading = () => (<Backdrop>
    <react_native_1.ActivityIndicator color={"#007856"} size={"large"}/>
  </Backdrop>);
exports.Loading = Loading;
const Backdrop = native_1.default.View `
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0);
`;
//# sourceMappingURL=ActivityIndicatorContext.js.map