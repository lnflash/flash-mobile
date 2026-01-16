"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("@testing-library/react-native");
const send_bitcoin_confirmation_screen_stories_1 = require("../../app/screens/send-bitcoin-screen/send-bitcoin-confirmation-screen.stories");
const helper_1 = require("./helper");
it("SendScreen Confirmation", async () => {
    const { findByLabelText } = (0, react_native_1.render)(<helper_1.ContextForScreen>
      <send_bitcoin_confirmation_screen_stories_1.Intraledger />
    </helper_1.ContextForScreen>);
    // it seems we need multiple act because the component re-render multiple times
    // probably this could be debug with why-did-you-render
    await (0, react_native_1.act)(async () => { });
    await (0, react_native_1.act)(async () => { });
    const { children } = await findByLabelText("Successful Fee");
    expect(children).toEqual(["₦0 ($0.00)"]);
});
//# sourceMappingURL=send-confirmation.spec.js.map