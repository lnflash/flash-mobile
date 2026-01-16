"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MenuSelect = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const item_1 = require("./item");
const MenuSelect = ({ value, onChange, children }) => {
    const [loading, setLoading] = react_1.default.useState(false);
    const childrenArray = react_1.default.Children.toArray(children);
    return (<react_native_1.View>
      {childrenArray.map((child) => (<item_1.Item key={child.key} {...child.props} selected={child.props.value === value} onChange={onChange} loading={loading} setLoading={setLoading}/>))}
    </react_native_1.View>);
};
exports.MenuSelect = MenuSelect;
//# sourceMappingURL=menu-select.js.map