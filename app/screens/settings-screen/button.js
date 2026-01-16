"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsButton = void 0;
const testProps_1 = require("@app/utils/testProps");
const themed_1 = require("@rneui/themed");
const SettingsButton = ({ title, onPress, variant, loading }) => {
    const styles = useStyles(variant);
    if (loading)
        return <themed_1.Skeleton style={styles.containerStyle}/>;
    return (<themed_1.Button title={title} {...(0, testProps_1.testProps)(title)} onPress={onPress} titleStyle={styles.titleStyle} containerStyle={styles.containerStyle} buttonStyle={styles.buttonStyle}/>);
};
exports.SettingsButton = SettingsButton;
const useStyles = (0, themed_1.makeStyles)(({ colors }, variant) => ({
    containerStyle: {
        height: 42,
        borderRadius: 12,
    },
    buttonStyle: {
        height: 42,
        borderRadius: 12,
        backgroundColor: colors.grey5,
    },
    titleStyle: {
        color: variant === "warning" ? colors.primary : colors.red,
    },
}));
//# sourceMappingURL=button.js.map