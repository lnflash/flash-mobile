"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetUserSlice = exports.setError = exports.setLoading = exports.updateUserData = exports.setUserData = exports.userSlice = void 0;
const toolkit_1 = require("@reduxjs/toolkit");
const initialState = {
    userData: null,
    loading: false,
    error: "",
};
exports.userSlice = (0, toolkit_1.createSlice)({
    name: "user",
    initialState,
    reducers: {
        setUserData: (state, action) => (Object.assign(Object.assign({}, state), { userData: action.payload })),
        updateUserData: (state, action) => (Object.assign(Object.assign({}, state), { userData: Object.assign(Object.assign({}, state.userData), action.payload) })),
        setLoading: (state, action) => (Object.assign(Object.assign({}, state), { loading: action.payload })),
        setError: (state, action) => (Object.assign(Object.assign({}, state), { error: action.payload })),
        resetUserSlice: () => (Object.assign({}, initialState)),
    },
});
_a = exports.userSlice.actions, exports.setUserData = _a.setUserData, exports.updateUserData = _a.updateUserData, exports.setLoading = _a.setLoading, exports.setError = _a.setError, exports.resetUserSlice = _a.resetUserSlice;
exports.default = exports.userSlice.reducer;
//# sourceMappingURL=userSlice.js.map