"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GaloyInfo = void 0;
const themed_1 = require("@rneui/themed");
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const GaloyInfo = ({ children, isWarning }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles({ isWarning });
    return (<react_native_1.View style={styles.container}>
      <react_native_1.View style={styles.verticalLine}/>
      <react_native_1.View style={styles.infoContainer}>
        <themed_1.Text style={styles.textContainer} type={"p3"} color={isWarning ? colors.warning : colors.blue5}>
          {children}
        </themed_1.Text>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.GaloyInfo = GaloyInfo;
const useStyles = (0, themed_1.makeStyles)(({ colors }, props) => ({
    container: {
        flexDirection: "row",
    },
    infoContainer: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderTopRightRadius: 8,
        borderBottomRightRadius: 8,
        backgroundColor: colors.grey5,
    },
    verticalLine: {
        width: 3,
        borderTopLeftRadius: 3,
        borderBottomLeftRadius: 3,
        backgroundColor: props.isWarning ? colors.warning : colors.blue5,
        height: "100%",
    },
    textContainer: {
        overflow: "hidden",
    },
}));
//# sourceMappingURL=galoy-info.js.map