"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const ResultError = ({ err }) => {
    const styles = useStyles();
    if (!!err) {
        return (<react_native_1.View style={styles.container}>
        <themed_1.Text style={styles.errorText} selectable>
          {err}
        </themed_1.Text>
      </react_native_1.View>);
    }
    else {
        return null;
    }
};
exports.default = ResultError;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        justifyContent: "center",
        alignItems: "center",
        marginTop: 14,
        marginLeft: 20,
        marginRight: 20,
    },
    errorText: {
        color: colors.error,
        textAlign: "center",
    },
}));
//# sourceMappingURL=ResultError.js.map