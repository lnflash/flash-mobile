"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatSetting = void 0;
const persistent_state_1 = require("@app/store/persistent-state");
const row_1 = require("./row");
const themed_1 = require("@rneui/themed");
const react_1 = __importDefault(require("react"));
const ChatSetting = () => {
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    return (<row_1.SettingsRow title="Enable Chat" leftIcon="chatbubbles-outline" action={() => { }} rightIcon={<themed_1.Switch value={!!persistentState.chatEnabled} onValueChange={(enabled) => {
                updateState((state) => {
                    if (state)
                        return Object.assign(Object.assign({}, state), { chatEnabled: enabled });
                    return undefined;
                });
            }}/>}/>);
};
exports.ChatSetting = ChatSetting;
//# sourceMappingURL=chat-setting.js.map