"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const galoy_icon_1 = require("../atomic/galoy-icon");
// utils
const testProps_1 = require("@app/utils/testProps");
const ResultSuccess = ({ success }) => {
    const styles = useStyles();
    if (success) {
        return (<react_native_1.View style={styles.container}>
        <react_native_1.View {...(0, testProps_1.testProps)("Success Icon")} style={styles.container}>
          <galoy_icon_1.GaloyIcon name={"payment-success"} size={128}/>
        </react_native_1.View>
      </react_native_1.View>);
    }
    else {
        return null;
    }
};
exports.default = ResultSuccess;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        justifyContent: "center",
        alignItems: "center",
        marginTop: 14,
        marginLeft: 20,
        marginRight: 20,
    },
}));
//# sourceMappingURL=ResultSuccess.js.map