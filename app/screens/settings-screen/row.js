"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsRow = void 0;
const react_1 = require("react");
const react_native_1 = require("react-native");
const testProps_1 = require("@app/utils/testProps");
const themed_1 = require("@rneui/themed");
const SettingsRow = ({ title, subtitle, subtitleShorter, leftIcon, rightIcon = "", action, rightIconAction = action, extraComponentBesideTitle = <></>, loading, spinner, shorter, }) => {
    const [hovering, setHovering] = (0, react_1.useState)(false);
    const styles = useStyles({ hovering, shorter });
    if (loading)
        return <themed_1.Skeleton style={styles.container} animation="pulse"/>;
    if (spinner)
        return (<react_native_1.View style={[styles.container, styles.center]}>
        <react_native_1.ActivityIndicator />
      </react_native_1.View>);
    const RightIcon = rightIcon !== null &&
        (typeof rightIcon === "string" ? (<themed_1.Icon name={rightIcon ? rightIcon : "chevron-forward"} type="ionicon"/>) : (rightIcon));
    return (<react_native_1.Pressable onPressIn={action ? () => setHovering(true) : () => { }} onPressOut={action ? () => setHovering(false) : () => { }} onPress={action ? action : undefined} {...(0, testProps_1.testProps)(title)}>
      <react_native_1.View style={[styles.container, styles.spacing]}>
        <react_native_1.View style={[styles.container, styles.spacing, styles.internalContainer]}>
          <themed_1.Icon name={leftIcon} type="ionicon"/>
          <react_native_1.View>
            <react_native_1.View style={styles.sidetoside}>
              <themed_1.Text type="p2">{title}</themed_1.Text>
              <themed_1.Text>{extraComponentBesideTitle}</themed_1.Text>
            </react_native_1.View>
            {subtitle && (<themed_1.Text type={subtitleShorter ? "p4" : "p3"} ellipsizeMode="tail" numberOfLines={1}>
                {subtitle}
              </themed_1.Text>)}
          </react_native_1.View>
        </react_native_1.View>
        <react_native_1.Pressable onPress={rightIconAction ? rightIconAction : undefined} {...(0, testProps_1.testProps)(title + "-right")}>
          <react_native_1.View style={styles.rightActionTouchArea}>{RightIcon}</react_native_1.View>
        </react_native_1.Pressable>
      </react_native_1.View>
    </react_native_1.Pressable>);
};
exports.SettingsRow = SettingsRow;
const useStyles = (0, themed_1.makeStyles)(({ colors }, { hovering, shorter }) => ({
    container: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: 16,
        backgroundColor: hovering ? colors.grey4 : undefined,
        minHeight: shorter ? 56 : 64,
    },
    spacing: {
        paddingHorizontal: 8,
        paddingRight: 12,
    },
    center: {
        justifyContent: "space-around",
    },
    rightActionTouchArea: {
        padding: 12,
        marginRight: -12,
        position: "relative",
    },
    sidetoside: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        columnGap: 5,
    },
    internalContainer: {
        flex: 2,
        justifyContent: "flex-start",
        paddingRight: 16,
    },
}));
//# sourceMappingURL=row.js.map