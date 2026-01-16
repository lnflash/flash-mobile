"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const home_screen_1 = require("../../app/screens/home-screen");
const react_native_1 = require("@testing-library/react-native");
const helper_1 = require("./helper");
it("HomeAuthed", async () => {
    (0, react_native_1.render)(<helper_1.ContextForScreen>
      <home_screen_1.HomeScreen />
    </helper_1.ContextForScreen>);
    await (0, react_native_1.act)(async () => { });
});
//# sourceMappingURL=home.spec.js.map