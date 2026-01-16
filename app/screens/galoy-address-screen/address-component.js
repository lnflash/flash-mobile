"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_native_1 = require("react-native");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const toast_1 = require("@app/utils/toast");
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const themed_1 = require("@rneui/themed");
const addressTypes = {
    lightning: "lightning",
    pos: "pos",
    paycode: "paycode",
};
const AddressComponent = ({ address, addressType, title, onToggleDescription, useGlobeIcon, }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const { name: bankName } = appConfig.galoyInstance;
    const trimmedUrl = address.includes("https://") || address.includes("http://")
        ? address.replace("https://", "")
        : address;
    const copyToClipboard = () => {
        clipboard_1.default.setString(address);
        (0, toast_1.toastShow)({
            message: (translations) => {
                switch (addressType) {
                    case addressTypes.lightning:
                        return translations.GaloyAddressScreen.copiedAddressToClipboard({
                            bankName,
                        });
                    case addressTypes.pos:
                        return translations.GaloyAddressScreen.copiedCashRegisterLinkToClipboard();
                    case addressTypes.paycode:
                        return translations.GaloyAddressScreen.copiedPaycodeToClipboard();
                }
            },
            type: "success",
            currentTranslation: LL,
        });
    };
    return (<react_native_1.View style={styles.container}>
      <react_native_1.View style={styles.titleContainer}>
        <themed_1.Text style={styles.addressTitle} type="p1">
          {title}
        </themed_1.Text>
        <react_native_1.Pressable onPress={onToggleDescription} style={styles.descriptionContainer}>
          <themed_1.Text style={styles.descriptionText}>{LL.GaloyAddressScreen.howToUseIt()}</themed_1.Text>
          <galoy_icon_1.GaloyIcon name="question" color={styles.descriptionText.color} size={20}/>
        </react_native_1.Pressable>
      </react_native_1.View>
      <react_native_1.View style={styles.infoContainer}>
        <themed_1.Text style={styles.address} bold type="p3">
          {trimmedUrl}
        </themed_1.Text>
        <react_native_1.View style={styles.iconsContainer}>
          {useGlobeIcon && (<react_native_1.Pressable onPress={() => react_native_1.Linking.openURL(address)}>
              <galoy_icon_1.GaloyIcon name="globe" size={20} color={colors.black}/>
            </react_native_1.Pressable>)}
          <react_native_1.Pressable onPress={copyToClipboard}>
            <galoy_icon_1.GaloyIcon name="copy-paste" size={20} color={colors.black}/>
          </react_native_1.Pressable>
          <react_native_1.Pressable onPress={() => {
            react_native_1.Share.share({
                url: address,
                message: address,
            });
        }}>
            <galoy_icon_1.GaloyIcon name="share" size={20} color={colors.black}/>
          </react_native_1.Pressable>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.default = AddressComponent;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        display: "flex",
        flexDirection: "column",
        rowGap: 20,
        width: "100%",
    },
    titleContainer: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
    },
    addressTitle: {
        fontSize: 16,
        lineHeight: 24,
        flexShrink: 1,
    },
    infoContainer: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        backgroundColor: colors.grey5,
        paddingVertical: 16,
        paddingHorizontal: 8,
        borderRadius: 8,
        columnGap: 20,
    },
    address: {
        color: colors.black,
        fontSize: 14,
        lineHeight: 24,
    },
    descriptionContainer: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        columnGap: 5,
    },
    descriptionText: {
        color: colors.primary,
        textDecorationLine: "underline",
        fontSize: 14,
        lineHeight: 18,
        fontWeight: "600",
    },
    iconsContainer: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        columnGap: 20,
    },
}));
//# sourceMappingURL=address-component.js.map