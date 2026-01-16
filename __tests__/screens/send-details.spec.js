"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("@testing-library/react-native");
const helper_1 = require("./helper");
const send_bitcoin_details_screen_stories_1 = require("../../app/screens/send-bitcoin-screen/send-bitcoin-details-screen.stories");
it("SendScreen Details", async () => {
    (0, react_native_1.render)(<helper_1.ContextForScreen>
      <send_bitcoin_details_screen_stories_1.Intraledger />
    </helper_1.ContextForScreen>);
    await (0, react_native_1.act)(async () => { });
});
//# sourceMappingURL=send-details.spec.js.map