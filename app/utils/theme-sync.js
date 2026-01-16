"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThemeSyncGraphql = void 0;
const generated_1 = require("@app/graphql/generated");
const themed_1 = require("@rneui/themed");
const react_1 = require("react");
const react_native_1 = require("react-native");
const ThemeSyncGraphql = () => {
    const { mode, setMode } = (0, themed_1.useThemeMode)();
    const data = (0, generated_1.useColorSchemeQuery)();
    (0, react_1.useEffect)(() => {
        var _a;
        const scheme = (_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.colorScheme;
        if (!scheme)
            return;
        // Default scheme is system
        if (scheme === "system") {
            const systemScheme = react_native_1.Appearance.getColorScheme();
            // Set if System Scheme is different
            if (systemScheme !== mode)
                setMode(systemScheme);
            // Listener for system scheme - in case OS theme is switched when the app is running
            const { remove: stopListener } = react_native_1.Appearance.addChangeListener(({ colorScheme }) => {
                if (!colorScheme)
                    return;
                if (colorScheme !== mode)
                    setMode(colorScheme);
            });
            return stopListener;
        }
        // Set if Set theme is different (and not system)
        if (scheme !== mode)
            setMode(scheme);
        return () => { };
    }, [data, setMode, mode]);
    return null;
};
exports.ThemeSyncGraphql = ThemeSyncGraphql;
//# sourceMappingURL=theme-sync.js.map