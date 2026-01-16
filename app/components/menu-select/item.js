"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Item = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const testProps_1 = require("@app/utils/testProps");
const Item = (_a) => {
    var { children, value, selected, onChange, loading, testPropId, setLoading } = _a, props = __rest(_a, ["children", "value", "selected", "onChange", "loading", "testPropId", "setLoading"]);
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    const [showActivityIndicator, setShowActivityIndicator] = react_1.default.useState(false);
    const onPress = async () => {
        if (selected || loading)
            return;
        setLoading(true);
        setShowActivityIndicator(true);
        try {
            await onChange(value);
        }
        finally {
            setLoading(false);
            setShowActivityIndicator(false);
        }
    };
    return (<themed_1.ListItem {...props} key={value} bottomDivider onPress={onPress}>
      <react_native_1.View style={styles.iconContainer}>
        {showActivityIndicator && <react_native_1.ActivityIndicator />}
        {selected && <Ionicons_1.default name="checkmark-circle" size={18} color={colors.green}/>}
      </react_native_1.View>
      <themed_1.ListItem.Title {...(testPropId ? (0, testProps_1.testProps)(testPropId) : {})}>
        {children}
      </themed_1.ListItem.Title>
    </themed_1.ListItem>);
};
exports.Item = Item;
const useStyles = (0, themed_1.makeStyles)(() => ({
    iconContainer: { width: 18 },
}));
//# sourceMappingURL=item.js.map