"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsGroup = void 0;
const react_1 = require("react");
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const testProps_1 = require("@app/utils/testProps");
const SettingsGroup = ({ name, items, initiallyExpanded = false }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const [isExpanded, setIsExpanded] = (0, react_1.useState)(initiallyExpanded);
    const filteredItems = items.filter((x) => x({}) !== null);
    return (<react_native_1.View style={styles.container}>
      {name && (<react_native_1.TouchableOpacity onPress={() => setIsExpanded(!isExpanded)} style={styles.headerContainer} {...(0, testProps_1.testProps)(name + "-group")}>
          <themed_1.Text type="p2" bold style={styles.headerText}>
            {name}
          </themed_1.Text>
          {isExpanded ? (<themed_1.Icon name={"chevron-down"} type="ionicon"/>) : (<themed_1.Icon name={"chevron-forward"} type="ionicon"/>)}
        </react_native_1.TouchableOpacity>)}
      {isExpanded && (<react_native_1.View style={styles.groupCard}>
          {filteredItems.map((Element, index) => (<react_native_1.View key={index}>
              <Element />
              {index < filteredItems.length - 1 && (<themed_1.Divider color={colors.grey4} style={styles.divider}/>)}
            </react_native_1.View>))}
        </react_native_1.View>)}
    </react_native_1.View>);
};
exports.SettingsGroup = SettingsGroup;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        marginBottom: 5,
    },
    headerContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 5,
    },
    headerText: {
        flex: 1,
    },
    groupCard: {
        marginTop: 5,
        backgroundColor: colors.grey5,
        borderRadius: 12,
        overflow: "hidden",
    },
    divider: {
        marginHorizontal: 10,
    },
}));
//# sourceMappingURL=group.js.map