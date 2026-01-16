"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const themed_1 = require("@rneui/themed");
const HideableArea = ({ children, isContentVisible, hiddenContent, style = {}, }) => {
    if (isContentVisible) {
        return (<>
        {hiddenContent || (<themed_1.Text type="h2" bold style={style}>
            ****
          </themed_1.Text>)}
      </>);
    }
    return <>{children}</>;
};
exports.default = HideableArea;
//# sourceMappingURL=hideable-area.js.map