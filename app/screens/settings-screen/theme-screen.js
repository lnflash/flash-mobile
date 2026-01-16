"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThemeScreen = void 0;
const React = __importStar(require("react"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const screen_1 = require("../../components/screen");
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const client_only_query_1 = require("@app/graphql/client-only-query");
const galoy_info_1 = require("@app/components/atomic/galoy-info");
const menu_select_1 = require("@app/components/menu-select");
const useStyles = (0, themed_1.makeStyles)(() => ({
    container: {
        padding: 10,
    },
    info: {
        marginTop: 20,
    },
}));
const ThemeScreen = () => {
    var _a, _b;
    const client = (0, client_1.useApolloClient)();
    const colorSchemeData = (0, generated_1.useColorSchemeQuery)();
    const colorScheme = (_b = (_a = colorSchemeData === null || colorSchemeData === void 0 ? void 0 : colorSchemeData.data) === null || _a === void 0 ? void 0 : _a.colorScheme) !== null && _b !== void 0 ? _b : "system";
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    const Themes = [
        {
            id: "system",
            text: LL.ThemeScreen.system(),
        },
        {
            id: "light",
            text: LL.ThemeScreen.light(),
        },
        {
            id: "dark",
            text: LL.ThemeScreen.dark(),
        },
    ];
    return (<screen_1.Screen style={styles.container} preset="scroll">
      <menu_select_1.MenuSelect value={colorScheme} onChange={async (scheme) => (0, client_only_query_1.updateColorScheme)(client, scheme)}>
        {Themes.map(({ id, text }) => (<menu_select_1.MenuSelectItem key={id} value={id}>
            {text}
          </menu_select_1.MenuSelectItem>))}
      </menu_select_1.MenuSelect>
      <react_native_1.View style={styles.info}>
        <galoy_info_1.GaloyInfo>{LL.ThemeScreen.info()}</galoy_info_1.GaloyInfo>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.ThemeScreen = ThemeScreen;
//# sourceMappingURL=theme-screen.js.map