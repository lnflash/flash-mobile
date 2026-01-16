"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationCardUI = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const galoy_icon_1 = require("../atomic/galoy-icon");
const galoy_icon_button_1 = require("../atomic/galoy-icon-button");
const NotificationCardUI = ({ title, text, icon, action, loading, dismissAction, }) => {
    const iconName = icon || "pencil";
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    if (loading) {
        return (<react_native_1.TouchableOpacity style={styles.loadingButtonContainer}>
        <react_native_1.ActivityIndicator size="small" color={colors.primary}/>
      </react_native_1.TouchableOpacity>);
    }
    return (<react_native_1.TouchableOpacity style={styles.buttonContainer} onPress={action}>
      <react_native_1.View style={styles.viewHeader}>
        <react_native_1.View style={styles.leftIconContainer}>
          <galoy_icon_1.GaloyIcon name={iconName} color={colors.primary} size={24}/>
        </react_native_1.View>

        <themed_1.Text type={"p1"} bold style={styles.titleStyle}>
          {title}
        </themed_1.Text>
        <react_native_1.View style={styles.rightIconContainer}>
          <galoy_icon_button_1.GaloyIconButton name="close" size={"small"} iconOnly={true} onPress={dismissAction}/>
        </react_native_1.View>
      </react_native_1.View>
      <react_native_1.View style={styles.textContainer}>
        <themed_1.Text type={"p2"}>{text}</themed_1.Text>
      </react_native_1.View>
    </react_native_1.TouchableOpacity>);
};
exports.NotificationCardUI = NotificationCardUI;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    buttonContainer: {
        padding: 12,
        backgroundColor: colors.grey5,
        borderRadius: 12,
        minHeight: 100,
        columnGap: 15,
        flexDirection: "column",
    },
    titleStyle: {
        flex: 1,
    },
    leftIconContainer: {
        width: 40,
        justifyContent: "flex-start",
        flexDirection: "row",
    },
    rightIconContainer: {
        width: 40,
        justifyContent: "flex-end",
        flexDirection: "row",
    },
    viewHeader: {
        flexDirection: "row",
        alignItems: "center",
    },
    loadingButtonContainer: {
        flexDirection: "column",
        padding: 12,
        backgroundColor: colors.grey5,
        borderRadius: 12,
        minHeight: 100,
        columnGap: 15,
        justifyContent: "center",
        alignItems: "center",
    },
    textContainer: {
        flexGrow: 1,
        paddingHorizontal: 40,
    },
}));
//# sourceMappingURL=notification-card-ui.js.map