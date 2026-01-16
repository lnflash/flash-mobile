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
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const native_1 = require("@react-navigation/native");
const themed_1 = require("@rneui/themed");
const react_native_vision_camera_1 = require("react-native-vision-camera");
const { width, height } = react_native_1.Dimensions.get("window");
const QRCamera = ({ device, processInvoice }) => {
    const styles = useStyles();
    const isFocused = (0, native_1.useIsFocused)();
    const codeScanner = (0, react_native_vision_camera_1.useCodeScanner)({
        codeTypes: ["qr", "ean-13"],
        onCodeScanned: (codes) => {
            codes.forEach((code) => processInvoice(code.value));
            console.log(`Scanned ${codes.length} codes!`);
        },
    });
    const onError = (0, react_1.useCallback)((error) => {
        console.error(error);
    }, []);
    return (<react_native_1.View style={styles.container}>
      <react_native_vision_camera_1.Camera style={styles.camera} device={device} isActive={isFocused} onError={onError} codeScanner={codeScanner} enableZoomGesture/>
    </react_native_1.View>);
};
const useStyles = (0, themed_1.makeStyles)(() => ({
    container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    camera: {
        width: width,
        height: height,
    },
}));
exports.default = QRCamera;
//# sourceMappingURL=QRCamera.js.map