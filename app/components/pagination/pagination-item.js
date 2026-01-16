"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaginationItem = void 0;
const themed_1 = require("@rneui/themed");
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_reanimated_1 = __importStar(require("react-native-reanimated"));
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        backgroundColor: colors._white,
        borderRadius: 50,
        overflow: "hidden",
    },
    animatedStyle: {
        borderRadius: 50,
        flex: 1,
    },
}));
const PaginationItem = (props) => {
    const styles = useStyles();
    const { animValue, index, length, backgroundColor, isRotate } = props;
    const width = 10;
    const containerDynamicStyle = {
        height: width,
        width,
        transform: [
            {
                rotateZ: isRotate ? "90deg" : "0deg",
            },
        ],
    };
    const animStyle = (0, react_native_reanimated_1.useAnimatedStyle)(() => {
        let inputRange = [index - 1, index, index + 1];
        let outputRange = [-width, 0, width];
        if (index === 0 && (animValue === null || animValue === void 0 ? void 0 : animValue.value) > length - 1) {
            inputRange = [length - 1, length, length + 1];
            outputRange = [-width, 0, width];
        }
        return {
            transform: [
                {
                    translateX: (0, react_native_reanimated_1.interpolate)(animValue === null || animValue === void 0 ? void 0 : animValue.value, inputRange, outputRange, react_native_reanimated_1.Extrapolate.CLAMP),
                },
            ],
        };
    }, [animValue, index, length]);
    return (<react_native_1.View style={[styles.container, containerDynamicStyle]}>
      <react_native_reanimated_1.default.View style={[styles.animatedStyle, { backgroundColor }, animStyle]}/>
    </react_native_1.View>);
};
exports.PaginationItem = PaginationItem;
//# sourceMappingURL=pagination-item.js.map