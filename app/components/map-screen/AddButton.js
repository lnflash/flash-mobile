"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddButton = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
// hooks
const level_context_1 = require("@app/graphql/level-context");
// utils
const toast_1 = require("@app/utils/toast");
const AddButton = ({ handleOnPress }) => {
    const { currentLevel: level } = (0, level_context_1.useLevel)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const handleAddPin = () => {
        handleOnPress(true);
        (0, toast_1.toastShow)({
            message: "Press anywhere on the screen to select a location to add.",
            type: "success",
        });
    };
    if (level === level_context_1.AccountLevel.Two || level === level_context_1.AccountLevel.Three) {
        return (<react_native_1.TouchableOpacity style={styles.addButton} onPress={handleAddPin}>
        <Ionicons_1.default name="add" size={50} color={colors.white}/>
      </react_native_1.TouchableOpacity>);
    }
    else {
        return null;
    }
};
exports.AddButton = AddButton;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    addButton: {
        position: "absolute",
        bottom: 30,
        right: 30,
        height: 60,
        width: 60,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 50,
        backgroundColor: colors.green,
        zIndex: 1,
    },
}));
//# sourceMappingURL=AddButton.js.map