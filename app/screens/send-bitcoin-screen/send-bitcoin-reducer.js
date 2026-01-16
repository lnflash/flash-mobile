"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendBitcoinDestinationReducer = exports.SendBitcoinActions = exports.DestinationState = void 0;
exports.DestinationState = {
    Entering: "entering",
    Validating: "validating",
    Valid: "valid",
    RequiresConfirmation: "requires-confirmation",
    Invalid: "invalid",
};
exports.SendBitcoinActions = {
    SetUnparsedDestination: "set-unparsed-destination",
    SetValidating: "set-validating",
    SetValid: "set-valid",
    SetInvalid: "set-invalid",
    SetRequiresConfirmation: "set-requires-confirmation",
    SetConfirmed: "set-confirmed",
};
const sendBitcoinDestinationReducer = (state, action) => {
    if (action.type !== exports.SendBitcoinActions.SetUnparsedDestination &&
        state.unparsedDestination !== action.payload.unparsedDestination) {
        return state;
    }
    switch (action.type) {
        case exports.SendBitcoinActions.SetUnparsedDestination:
            return {
                unparsedDestination: action.payload.unparsedDestination,
                destinationState: exports.DestinationState.Entering,
            };
        case exports.SendBitcoinActions.SetValidating:
            return {
                unparsedDestination: state.unparsedDestination,
                destinationState: exports.DestinationState.Validating,
            };
        case exports.SendBitcoinActions.SetValid:
            return {
                unparsedDestination: state.unparsedDestination,
                destinationState: exports.DestinationState.Valid,
                destination: action.payload.validDestination,
            };
        case exports.SendBitcoinActions.SetInvalid:
            if (state.destinationState === exports.DestinationState.Validating) {
                return {
                    unparsedDestination: state.unparsedDestination,
                    destinationState: exports.DestinationState.Invalid,
                    invalidDestination: action.payload.invalidDestination,
                };
            }
            throw new Error("Invalid state transition");
        case exports.SendBitcoinActions.SetRequiresConfirmation:
            if (state.destinationState === exports.DestinationState.Validating) {
                return {
                    unparsedDestination: state.unparsedDestination,
                    destinationState: exports.DestinationState.RequiresConfirmation,
                    destination: action.payload.validDestination,
                    confirmationType: action.payload.confirmationType,
                };
            }
            throw new Error("Invalid state transition");
        case exports.SendBitcoinActions.SetConfirmed:
            if (state.destinationState === exports.DestinationState.RequiresConfirmation) {
                return {
                    unparsedDestination: state.unparsedDestination,
                    destinationState: exports.DestinationState.Valid,
                    destination: state.destination,
                    confirmationType: state.confirmationType,
                };
            }
            throw new Error("Invalid state transition");
    }
};
exports.sendBitcoinDestinationReducer = sendBitcoinDestinationReducer;
//# sourceMappingURL=send-bitcoin-reducer.js.map