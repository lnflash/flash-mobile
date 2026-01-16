"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NostrSecret = void 0;
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const row_1 = require("../row");
const NostrSecret = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const navigation = (0, native_1.useNavigation)();
    const handleNavigateToNostrScreen = () => {
        navigation.navigate("NostrSettingsScreen");
    };
    return (<>
      <row_1.SettingsRow title={LL.SettingsScreen.showNostrSecret() || "Nostr Account"} leftIcon="globe-outline" rightIcon="chevron-forward" action={handleNavigateToNostrScreen}/>
    </>);
};
exports.NostrSecret = NostrSecret;
//# sourceMappingURL=nostr-secret.js.map