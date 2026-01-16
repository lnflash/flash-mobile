"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ButtonGroup = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const testProps_1 = require("@app/utils/testProps");
const ButtonForButtonGroup = ({ text, icon, selected, onPress }) => {
    const styles = useStyles(Boolean(selected));
    return (<react_native_1.TouchableWithoutFeedback onPress={onPress}>
      <react_native_1.View style={styles.button}>
        <themed_1.Text {...(0, testProps_1.testProps)(text)} style={styles.text}>
          {text}
        </themed_1.Text>
        {typeof icon === "string" ? (<Ionicons_1.default style={styles.text} name={icon}/>) : selected ? (icon.selected) : (icon.normal)}
      </react_native_1.View>
    </react_native_1.TouchableWithoutFeedback>);
};
const ButtonGroup = ({ buttons, selectedId, onPress, style, disabled, }) => {
    const styles = useStyles();
    const selectedButton = buttons.find(({ id }) => id === selectedId);
    return (<react_native_1.View style={[styles.buttonGroup, style]}>
      {!disabled &&
            buttons.map((props) => (<ButtonForButtonGroup key={props.id} {...props} onPress={() => {
                    if (selectedId !== props.id) {
                        onPress(props.id);
                    }
                }} selected={selectedId === props.id}/>))}
      {disabled && selectedButton && (<ButtonForButtonGroup {...selectedButton} selected={true} onPress={() => { }}/>)}
    </react_native_1.View>);
};
exports.ButtonGroup = ButtonGroup;
const useStyles = (0, themed_1.makeStyles)(({ colors }, selected) => ({
    button: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 10,
        paddingVertical: 15,
        marginHorizontal: 3,
        borderRadius: 5,
        backgroundColor: selected ? colors.grey4 : colors.grey5,
    },
    text: {
        fontSize: 16,
        color: selected ? colors.primary : colors.grey1,
    },
    buttonGroup: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
}));
//# sourceMappingURL=button-group.js.map