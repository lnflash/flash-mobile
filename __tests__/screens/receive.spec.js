"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("@testing-library/react-native");
const helper_1 = require("./helper");
const receive_screen_1 = __importDefault(require("@app/screens/receive-bitcoin-screen/receive-screen"));
it("Receive", async () => {
    (0, react_native_1.render)(<helper_1.ContextForScreen>
      <receive_screen_1.default />
    </helper_1.ContextForScreen>);
    await (0, react_native_1.act)(async () => { });
    await (0, react_native_1.act)(async () => { });
});
//# sourceMappingURL=receive.spec.js.map