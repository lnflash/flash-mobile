"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.numberPadReducer = exports.Key = exports.NumberPadReducerActionType = void 0;
exports.NumberPadReducerActionType = {
    SetAmount: "SetAmount",
    HandleKeyPress: "HandleKeyPress",
    ClearAmount: "ClearAmount",
};
exports.Key = {
    Backspace: "⌫",
    0: "0",
    1: "1",
    2: "2",
    3: "3",
    4: "4",
    5: "5",
    6: "6",
    7: "7",
    8: "8",
    9: "9",
    Decimal: ".",
};
const numberPadReducer = (state, action) => {
    const { numberPadNumber: { majorAmount, minorAmount, hasDecimal }, numberOfDecimalsAllowed, } = state;
    switch (action.action) {
        case exports.NumberPadReducerActionType.SetAmount:
            return action.payload;
        case exports.NumberPadReducerActionType.HandleKeyPress:
            if (action.payload.key === exports.Key.Backspace) {
                if (minorAmount.length > 0) {
                    return Object.assign(Object.assign({}, state), { numberPadNumber: {
                            majorAmount,
                            hasDecimal,
                            minorAmount: minorAmount.slice(0, -1),
                        } });
                }
                if (hasDecimal) {
                    return Object.assign(Object.assign({}, state), { numberPadNumber: {
                            majorAmount,
                            hasDecimal: false,
                            minorAmount,
                        } });
                }
                return Object.assign(Object.assign({}, state), { numberPadNumber: {
                        majorAmount: majorAmount.slice(0, -1),
                        hasDecimal,
                        minorAmount,
                    } });
            }
            if (action.payload.key === exports.Key.Decimal) {
                if (numberOfDecimalsAllowed > 0) {
                    return Object.assign(Object.assign({}, state), { numberPadNumber: {
                            majorAmount,
                            minorAmount,
                            hasDecimal: true,
                        } });
                }
                return state;
            }
            if (hasDecimal && minorAmount.length < numberOfDecimalsAllowed) {
                return Object.assign(Object.assign({}, state), { numberPadNumber: {
                        majorAmount,
                        hasDecimal,
                        minorAmount: minorAmount + action.payload.key,
                    } });
            }
            if (hasDecimal && minorAmount.length >= numberOfDecimalsAllowed) {
                return state;
            }
            return Object.assign(Object.assign({}, state), { numberPadNumber: {
                    majorAmount: majorAmount + action.payload.key,
                    minorAmount,
                    hasDecimal,
                } });
        case exports.NumberPadReducerActionType.ClearAmount:
            return Object.assign(Object.assign({}, state), { numberPadNumber: {
                    majorAmount: "",
                    minorAmount: "",
                    hasDecimal: false,
                } });
        default:
            return state;
    }
};
exports.numberPadReducer = numberPadReducer;
//# sourceMappingURL=number-pad-reducer.js.map