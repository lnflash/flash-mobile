"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
// assets
const arrow_up_svg_1 = __importDefault(require("@app/assets/icons/arrow-up.svg"));
const arrow_down_svg_1 = __importDefault(require("@app/assets/icons/arrow-down.svg"));
const swap_svg_1 = __importDefault(require("@app/assets/icons/swap.svg"));
const qr_code_new_svg_1 = __importDefault(require("@app/assets/icons/qr-code-new.svg"));
const setting_svg_1 = __importDefault(require("@app/assets/icons/setting.svg"));
const card_remove_svg_1 = __importDefault(require("@app/assets/icons/card-remove.svg"));
const dollar_new_svg_1 = __importDefault(require("@app/assets/icons/dollar-new.svg"));
const icons = {
    up: arrow_up_svg_1.default,
    down: arrow_down_svg_1.default,
    swap: swap_svg_1.default,
    qr: qr_code_new_svg_1.default,
    setting: setting_svg_1.default,
    cardRemove: card_remove_svg_1.default,
    dollar: dollar_new_svg_1.default,
};
const IconBtn = ({ type = "solid", icon, label, onPress }) => {
    const { colors } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const Icon = icons[icon];
    return (<react_native_1.View style={styles.container}>
      <react_native_1.TouchableOpacity style={[styles.base, styles[type]]} onPress={onPress} activeOpacity={0.5}>
        <Icon color={colors.icon01} width={30} height={30}/>
      </react_native_1.TouchableOpacity>
      <themed_1.Text type="bm" bold style={styles.label}>
        {label}
      </themed_1.Text>
    </react_native_1.View>);
};
exports.default = IconBtn;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 8,
        marginHorizontal: 8,
    },
    base: {
        height: 64,
        width: 64,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 100,
        marginBottom: 5,
    },
    solid: {
        backgroundColor: colors.button01,
    },
    outline: {
        borderWidth: 1,
        borderColor: colors.border02,
    },
    clear: {
        backgroundColor: colors.button02,
    },
    label: {
        textAlign: "center",
    },
}));
//# sourceMappingURL=IconBtn.js.map