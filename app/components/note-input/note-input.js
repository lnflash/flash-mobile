"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoteInput = void 0;
const react_1 = __importDefault(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
const testProps_1 = require("@app/utils/testProps");
const i18n_react_1 = require("@app/i18n/i18n-react");
const galoy_icon_1 = require("../atomic/galoy-icon");
const NoteInput = ({ onChangeText, value, editable, onBlur, style, big = true, newDesign = false, }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles({ editable: Boolean(editable), big });
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    if (newDesign) {
        return (<react_native_1.TextInput onChangeText={onChangeText} onBlur={onBlur} value={value} editable={editable} style={styles.input} placeholder={LL.NoteInput.addNote()} placeholderTextColor={colors.placeholder} maxLength={500}/>);
    }
    return (<react_native_1.View style={[styles.fieldBackground, style]}>
      <react_native_1.View style={styles.noteContainer}>
        <react_native_1.TextInput {...(0, testProps_1.testProps)("add-note")} style={styles.noteInput} placeholder={LL.NoteInput.addNote()} placeholderTextColor={colors.black} onChangeText={onChangeText} onBlur={onBlur} value={value} editable={editable} selectTextOnFocus maxLength={500}/>
        <react_native_1.View style={styles.noteIconContainer}>
          <galoy_icon_1.GaloyIcon name={"note"} size={18} color={colors.primary}/>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.NoteInput = NoteInput;
const useStyles = (0, themed_1.makeStyles)(({ colors }, { editable, big }) => ({
    fieldBackground: {
        flexDirection: "row",
        borderStyle: "solid",
        overflow: "hidden",
        backgroundColor: colors.grey5,
        paddingHorizontal: 10,
        borderRadius: 10,
        alignItems: "center",
        minHeight: big ? 60 : 50,
        opacity: editable ? 1 : 0.5,
    },
    fieldContainer: {
        marginBottom: 12,
    },
    noteContainer: {
        flex: 1,
        flexDirection: "row",
    },
    noteIconContainer: {
        justifyContent: "center",
        alignItems: "flex-start",
        paddingLeft: 20,
    },
    noteIcon: {
        justifyContent: "center",
        alignItems: "center",
    },
    noteInput: {
        flex: 1,
        color: colors.black,
        fontSize: 16,
    },
    input: {
        fontSize: 14,
        fontFamily: "Sora",
        color: colors.black,
        padding: 20,
    },
}));
//# sourceMappingURL=note-input.js.map