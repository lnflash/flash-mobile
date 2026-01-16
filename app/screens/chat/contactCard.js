"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ContactCard.tsx
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const themed_2 = require("@rneui/themed");
const nostr_tools_1 = require("nostr-tools");
const ContactCard = ({ item, profileMap, style, containerStyle, onPress, }) => {
    var _a;
    const { theme } = (0, themed_2.useTheme)();
    const colors = theme.colors;
    const getContactMetadata = (contact) => {
        let profile = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(contact.pubkey || "");
        let displayName;
        try {
            displayName =
                (profile === null || profile === void 0 ? void 0 : profile.nip05) ||
                    (profile === null || profile === void 0 ? void 0 : profile.name) ||
                    (profile === null || profile === void 0 ? void 0 : profile.username) ||
                    nostr_tools_1.nip19.npubEncode(contact.pubkey).slice(0, 9) + "..";
        }
        catch (e) {
            displayName = contact.pubkey.slice(0, 9) + "...";
        }
        return {
            displayName: (profile === null || profile === void 0 ? void 0 : profile.name) ||
                (profile === null || profile === void 0 ? void 0 : profile.username) ||
                nostr_tools_1.nip19.npubEncode(contact.pubkey).slice(0, 12) + "...",
            nip05: profile === null || profile === void 0 ? void 0 : profile.nip05,
        };
    };
    const metadata = getContactMetadata(item);
    return (<themed_1.ListItem style={style} containerStyle={containerStyle} onPress={onPress}>
      <react_native_1.Image source={{
            uri: ((_a = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(item.pubkey)) === null || _a === void 0 ? void 0 : _a.picture) ||
                "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
        }} style={{ width: 40, height: 40, borderRadius: 40 / 2 }}/>
      <themed_1.ListItem.Content>
        <themed_1.ListItem.Title style={{ fontSize: 16, fontWeight: "600", color: colors.black }}>
          {metadata.displayName}
        </themed_1.ListItem.Title>
        {metadata.nip05 && (<themed_1.ListItem.Subtitle style={{ fontSize: 13, color: colors.grey3, marginTop: 2 }}>
            {metadata.nip05}
          </themed_1.ListItem.Subtitle>)}
      </themed_1.ListItem.Content>
    </themed_1.ListItem>);
};
exports.default = ContactCard;
//# sourceMappingURL=contactCard.js.map