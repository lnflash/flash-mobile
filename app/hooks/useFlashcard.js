"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useFlashcard = void 0;
const react_1 = require("react");
const Flashcard_1 = require("../contexts/Flashcard");
const useFlashcard = () => {
    const context = (0, react_1.useContext)(Flashcard_1.FlashcardContext);
    return context;
};
exports.useFlashcard = useFlashcard;
//# sourceMappingURL=useFlashcard.js.map