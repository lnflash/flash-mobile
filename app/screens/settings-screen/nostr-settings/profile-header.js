"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileHeader = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const toast_1 = require("@app/utils/toast");
const styles_1 = require("./styles");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const ProfileHeader = ({ userProfile, copyToClipboard }) => {
    var _a;
    const styles = (0, styles_1.useStyles)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data: dataAuthed } = (0, generated_1.useHomeAuthedQuery)({
        skip: !isAuthed,
        fetchPolicy: "network-only",
        errorPolicy: "all",
        nextFetchPolicy: "network-only",
    });
    const { appConfig: { galoyInstance: { lnAddressHostname: lnDomain }, }, } = (0, hooks_1.useAppConfig)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const profileText = ((_a = dataAuthed === null || dataAuthed === void 0 ? void 0 : dataAuthed.me) === null || _a === void 0 ? void 0 : _a.username)
        ? `${dataAuthed.me.username}@${lnDomain}`
        : LL.Nostr.findingYou();
    return (<react_native_1.View style={styles.profileHeader}>
      <react_native_1.View style={styles.profileIcon}>
        <react_native_1.Image source={{
            uri: (userProfile === null || userProfile === void 0 ? void 0 : userProfile.picture) ||
                "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
        }} style={{
            width: 80,
            height: 80,
            borderRadius: 40,
        }}/>
      </react_native_1.View>
      <react_native_1.TouchableOpacity onPress={() => {
            var _a;
            if ((_a = dataAuthed === null || dataAuthed === void 0 ? void 0 : dataAuthed.me) === null || _a === void 0 ? void 0 : _a.username) {
                copyToClipboard(profileText, (copied) => {
                    (0, toast_1.toastShow)({
                        message: LL.Nostr.common.copied(),
                        type: "success",
                    });
                });
            }
        }} activeOpacity={0.7} style={styles.profileInfo}>
        <themed_1.Text>{profileText}</themed_1.Text>
      </react_native_1.TouchableOpacity>
    </react_native_1.View>);
};
exports.ProfileHeader = ProfileHeader;
//# sourceMappingURL=profile-header.js.map