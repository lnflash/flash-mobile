"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIos = exports.shuffle = void 0;
const react_native_1 = require("react-native");
// https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
const shuffle = (array) => {
    let currentIndex = array.length;
    let temporaryValue;
    let randomIndex;
    // While there remain elements to shuffle...
    while (currentIndex !== 0) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;
        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }
    return array;
};
exports.shuffle = shuffle;
exports.isIos = react_native_1.Platform.OS === "ios";
//# sourceMappingURL=helper.js.map