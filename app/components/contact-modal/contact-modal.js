"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openWhatsAppAction = exports.SupportChannels = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const config_1 = require("@app/config");
const i18n_react_1 = require("@app/i18n/i18n-react");
const external_1 = require("@app/utils/external");
const themed_1 = require("@rneui/themed");
exports.SupportChannels = {
    Email: "email",
    // Telegram: "telegram",
    Discord: "discord",
    WhatsApp: "whatsapp",
    StatusPage: "statusPage",
    Mattermost: "mattermost",
    Faq: "faq",
    Chatbot: "chatbot",
};
/*
A modal component that displays contact options at the bottom of the screen.
*/
const ContactModal = ({ isVisible, toggleModal, messageBody, messageSubject, supportChannelsToHide, }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const openEmailAction = () => {
        react_native_1.Linking.openURL(`mailto:${config_1.CONTACT_EMAIL_ADDRESS}?subject=${encodeURIComponent(messageSubject)}&body=${encodeURIComponent(messageBody)}`);
    };
    // TODO: extract in Instance
    // const openTelegramAction = () => Linking.openURL(`https://t.me/+TsqkMBTyU9o0ZTlh`)
    const openDiscordAction = () => react_native_1.Linking.openURL("https://discord.gg/8jCg8eCRhF");
    const openMattermostAction = () => react_native_1.Linking.openURL(`https://chat.galoy.io`);
    const contactOptionList = [
        {
            name: LL.support.statusPage(),
            icon: <themed_1.Icon name={"alert-circle-outline"} type="ionicon"/>,
            action: () => {
                // TODO: extract in Instance
                react_native_1.Linking.openURL(`https://blink.statuspage.io/`);
            },
            hidden: supportChannelsToHide === null || supportChannelsToHide === void 0 ? void 0 : supportChannelsToHide.includes(exports.SupportChannels.StatusPage),
        },
        //name: LL.support.telegram(),
        //icon: <TelegramOutline width={24} height={24} fill={colors.black} />,
        //name: LL.support.Discord(),
        {
            name: LL.support.discord(),
            icon: <themed_1.Icon name={"logo-discord"} type="ionicon" color={colors.black}/>,
            action: () => {
                openDiscordAction();
                toggleModal();
            },
            hidden: supportChannelsToHide === null || supportChannelsToHide === void 0 ? void 0 : supportChannelsToHide.includes(exports.SupportChannels.Discord),
        },
        {
            name: LL.support.mattermost(),
            icon: <themed_1.Icon name={"chatbubbles-outline"} type="ionicon" color={colors.black}/>,
            action: () => {
                openMattermostAction();
                toggleModal();
            },
            hidden: supportChannelsToHide === null || supportChannelsToHide === void 0 ? void 0 : supportChannelsToHide.includes(exports.SupportChannels.Mattermost),
        },
        {
            name: LL.support.whatsapp(),
            icon: <themed_1.Icon name={"logo-whatsapp"} type="ionicon" color={colors.black}/>,
            action: () => {
                (0, exports.openWhatsAppAction)(messageBody);
                toggleModal();
            },
            hidden: supportChannelsToHide === null || supportChannelsToHide === void 0 ? void 0 : supportChannelsToHide.includes(exports.SupportChannels.WhatsApp),
        },
        {
            name: LL.support.email(),
            icon: <themed_1.Icon name={"mail-outline"} type="ionicon" color={colors.black}/>,
            action: () => {
                openEmailAction();
                toggleModal();
            },
            hidden: supportChannelsToHide === null || supportChannelsToHide === void 0 ? void 0 : supportChannelsToHide.includes(exports.SupportChannels.Email),
        },
    ];
    return (<react_native_modal_1.default isVisible={isVisible} backdropOpacity={0.3} backdropColor={colors.grey3} onBackdropPress={toggleModal} style={styles.modal}>
      {contactOptionList.map((item) => {
            if (item.hidden)
                return null;
            return (<themed_1.ListItem key={item.name} bottomDivider onPress={item.action} containerStyle={styles.listItemContainer}>
            {item.icon}
            <themed_1.ListItem.Content>
              <themed_1.ListItem.Title style={styles.listItemTitle}>{item.name}</themed_1.ListItem.Title>
            </themed_1.ListItem.Content>
            <themed_1.ListItem.Chevron name={"chevron-forward"} type="ionicon"/>
          </themed_1.ListItem>);
        })}
    </react_native_modal_1.default>);
};
exports.default = ContactModal;
const openWhatsAppAction = (message) => {
    (0, external_1.openWhatsApp)(config_1.WHATSAPP_CONTACT_NUMBER, message);
};
exports.openWhatsAppAction = openWhatsAppAction;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    modal: {
        justifyContent: "flex-end",
        flexGrow: 1,
        marginHorizontal: 0,
    },
    listItemContainer: {
        backgroundColor: colors.white,
    },
    listItemTitle: {
        color: colors.black,
    },
    icons: {
        color: colors.black,
    },
}));
//# sourceMappingURL=contact-modal.js.map