"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const send_bitcoin_destination_screen_1 = __importDefault(require("@app/screens/send-bitcoin-screen/send-bitcoin-destination-screen"));
const react_native_1 = require("@testing-library/react-native");
const helper_1 = require("./helper");
const sendBitcoinDestination = {
    name: "sendBitcoinDestination",
    key: "sendBitcoinDestination",
    params: {
        payment: "",
        username: "",
    },
};
it("SendScreen Destination", async () => {
    (0, react_native_1.render)(<helper_1.ContextForScreen>
      <send_bitcoin_destination_screen_1.default route={sendBitcoinDestination}/>
    </helper_1.ContextForScreen>);
    await (0, react_native_1.act)(async () => { });
});
//# sourceMappingURL=send-destination.spec.js.map