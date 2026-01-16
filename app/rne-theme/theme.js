"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const themed_1 = require("@rneui/themed");
const colors_1 = require("./colors");
const theme = (0, themed_1.createTheme)({
    lightColors: colors_1.light,
    darkColors: colors_1.dark,
    mode: "light",
    components: {
        Button: {
            containerStyle: {
                borderRadius: 50,
            },
            buttonStyle: {
                paddingHorizontal: 32,
                paddingVertical: 8,
                borderRadius: 50,
            },
        },
        Text: (props, { colors }) => {
            const universalStyle = {
                color: props.color || colors.black,
                fontFamily: "Sora",
            };
            const sizeStyle = props.type
                ? {
                    h1: {
                        fontSize: 24,
                        lineHeight: 32,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    h2: {
                        fontSize: 20,
                        lineHeight: 24,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    p1: {
                        fontSize: 18,
                        lineHeight: 24,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    p2: {
                        fontSize: 16,
                        lineHeight: 24,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    p3: {
                        fontSize: 14,
                        lineHeight: 18,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    p4: {
                        fontSize: 12,
                        lineHeight: 18,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    caption: {
                        fontSize: 13,
                        lineHeight: 16.38,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    bm: {
                        fontSize: 14,
                        lineHeight: 17.64,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    bl: {
                        fontSize: 16,
                        lineHeight: 20.16,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    h01: {
                        fontSize: 20,
                        lineHeight: 25.2,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    h02: {
                        fontSize: 24,
                        lineHeight: 30.24,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    h03: {
                        fontSize: 40,
                        lineHeight: 50.4,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    h04: {
                        fontSize: 56,
                        lineHeight: 70.56,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    h05: {
                        fontSize: 72,
                        lineHeight: 90.72,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                    h06: {
                        fontSize: 90,
                        lineHeight: 113.4,
                        fontWeight: props.bold ? "600" : "400",
                        fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
                    },
                }[props.type]
                : {};
            return {
                style: Object.assign(Object.assign({}, universalStyle), sizeStyle),
            };
        },
    },
});
exports.default = theme;
//# sourceMappingURL=theme.js.map