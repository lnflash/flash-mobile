"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useIsAuthed = exports.IsAuthedContextProvider = void 0;
const react_1 = require("react");
const IsAuthed = (0, react_1.createContext)(false);
exports.IsAuthedContextProvider = IsAuthed.Provider;
const useIsAuthed = () => (0, react_1.useContext)(IsAuthed);
exports.useIsAuthed = useIsAuthed;
//# sourceMappingURL=is-authed-context.js.map