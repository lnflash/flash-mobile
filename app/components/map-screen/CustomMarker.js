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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomMarker = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/display-name */
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const themed_1 = require("@rneui/themed");
const react_native_maps_1 = require("react-native-maps");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
// assets
const pos_terminal_svg_1 = __importDefault(require("@app/assets/illustrations/pos-terminal.svg"));
const dollar_bitcoin_exchange_svg_1 = __importDefault(require("@app/assets/illustrations/dollar-bitcoin-exchange.svg"));
const present_gift_svg_1 = __importDefault(require("@app/assets/illustrations/present-gift.svg"));
// Constants
const DOMAIN_MAP = {
    blink: "@blink.sv",
    flash: "@flashapp.me",
};
const Icons = {
    pos: pos_terminal_svg_1.default,
    exchange: dollar_bitcoin_exchange_svg_1.default,
    present: present_gift_svg_1.default,
};
const SERVICE_BADGES = [
    {
        key: "acceptsFlash",
        icon: "pos",
        label: "✅ Flash Payments",
        description: "Accepts instant Bitcoin payments via Flash app and Flashcards",
    },
    {
        key: "redeemTopup",
        icon: "exchange",
        label: "🔄 Cash Services",
        description: "Top up or redeem funds from Flash Cash wallets",
    },
    {
        key: "hasRewards",
        icon: "present",
        label: "🎁 Loyalty Rewards",
        description: "Earn points on purchases, redeemable at any participating location",
    },
];
const ServiceBadge = (0, react_1.memo)(({ isActive, icon }) => {
    const CustomIcon = Icons[icon];
    if (isActive)
        return <CustomIcon width={50} height={50}/>;
    return null;
});
const BusinessMarker = (0, react_1.memo)(({ item, index, styles, colors, isAuthed, LL, navigation }) => {
    const key = `${item.username}-${item.mapInfo.title}-${index}`;
    // Navigation handlers
    const handlePayment = (0, react_1.useCallback)(() => {
        const domain = DOMAIN_MAP[item.source];
        const usernameWithDomain = `${item.username}${domain}`;
        if (isAuthed && (item === null || item === void 0 ? void 0 : item.username)) {
            navigation.navigate("sendBitcoinDestination", {
                username: usernameWithDomain,
            });
        }
        else {
            navigation.navigate("phoneFlow");
        }
    }, [item.source, item.username, isAuthed, navigation]);
    const handleDirections = (0, react_1.useCallback)(() => {
        if (item.mapInfo.coordinates) {
            const { latitude, longitude } = item.mapInfo.coordinates;
            const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
            react_native_1.Linking.openURL(url);
        }
    }, [item.mapInfo.coordinates]);
    // Service info handler
    const handleViewServices = (0, react_1.useCallback)(() => {
        const activeServices = SERVICE_BADGES.filter((badge) => item[badge.key] !== false).map((badge) => `${badge.label}\n${badge.description}`);
        const serviceCount = activeServices.length;
        const subtitle = serviceCount === 1
            ? "This location offers 1 service:"
            : `This location offers ${serviceCount} services:`;
        const message = activeServices.length > 0
            ? `${subtitle}\n\n${activeServices.join("\n\n")}`
            : "No service information is currently available for this location.";
        react_native_1.Alert.alert(item.mapInfo.title, message, [{ text: "Got it", style: "default" }], {
            cancelable: true,
        });
    }, [item]);
    // Main options handler
    const handleShowOptions = (0, react_1.useCallback)(() => {
        react_native_1.Alert.alert(item.mapInfo.title, "Choose an action", [
            { text: LL.MapScreen.payBusiness(), onPress: handlePayment },
            { text: LL.MapScreen.getDirections(), onPress: handleDirections },
            { text: "View Services", onPress: handleViewServices },
            { text: "Cancel", style: "cancel" },
        ], { cancelable: true });
    }, [item.mapInfo.title, LL, handlePayment, handleDirections, handleViewServices]);
    const firstLetter = item.mapInfo.title.charAt(0).toUpperCase();
    return (<react_native_maps_1.Marker coordinate={item.mapInfo.coordinates} key={key} pinColor={colors._orange} tracksViewChanges={false}>
      <react_native_maps_1.Callout onPress={handleShowOptions}>
        <react_native_1.View style={styles.calloutContainer}>
          <react_native_1.View style={styles.menu}>
            <Ionicons_1.default name="menu-outline" size={30}/>
          </react_native_1.View>
          <react_native_1.View style={styles.logoContainer}>
            <react_native_1.View style={styles.logoCircle}>
              <themed_1.Text type="h1" color={colors.white}>
                {firstLetter}
              </themed_1.Text>
            </react_native_1.View>
            <react_native_1.View style={styles.verifiedBadge}>
              <Ionicons_1.default name="checkmark-circle" size={24} color={colors.green}/>
            </react_native_1.View>
          </react_native_1.View>
          <themed_1.Text type="p1" bold style={{ marginBottom: 5 }}>
            {item.mapInfo.title}
          </themed_1.Text>
          <themed_1.Text type="p3" color={colors.primary}>
            Provided services
          </themed_1.Text>
          <react_native_1.View style={styles.badgesContainer}>
            {SERVICE_BADGES.map((badge) => (<ServiceBadge key={badge.key} isActive={item[badge.key] !== false} icon={badge.icon}/>))}
          </react_native_1.View>
        </react_native_1.View>
      </react_native_maps_1.Callout>
    </react_native_maps_1.Marker>);
});
exports.CustomMarker = (0, react_1.memo)(({ blinkData, flashData }) => {
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    // Combine and transform marker data
    const markerData = (0, react_1.useMemo)(() => {
        var _a, _b, _c, _d;
        const setServiceDefaults = (item) => {
            var _a, _b, _c;
            return (Object.assign(Object.assign({}, item), { acceptsFlash: (_a = item.acceptsFlash) !== null && _a !== void 0 ? _a : true, redeemTopup: (_b = item.redeemTopup) !== null && _b !== void 0 ? _b : false, hasRewards: (_c = item.hasRewards) !== null && _c !== void 0 ? _c : false }));
        };
        const blinkMarkers = (_b = (_a = blinkData === null || blinkData === void 0 ? void 0 : blinkData.businessMapMarkers) === null || _a === void 0 ? void 0 : _a.map((item) => setServiceDefaults(Object.assign(Object.assign({}, item), { source: "blink" })))) !== null && _b !== void 0 ? _b : [];
        const flashMarkers = (_d = (_c = flashData === null || flashData === void 0 ? void 0 : flashData.businessMapMarkers) === null || _c === void 0 ? void 0 : _c.map((item) => setServiceDefaults(Object.assign(Object.assign({}, item), { source: "flash" })))) !== null && _d !== void 0 ? _d : [];
        return [...blinkMarkers, ...flashMarkers].filter(Boolean);
    }, [blinkData, flashData]);
    // Generate markers
    const markers = (0, react_1.useMemo)(() => markerData.map((item, index) => (<BusinessMarker key={`${item.username}-${item.mapInfo.title}-${index}`} item={item} index={index} styles={styles} colors={colors} isAuthed={isAuthed} LL={LL} navigation={navigation}/>)), [markerData, styles, colors, isAuthed, LL, navigation]);
    return markers;
}, (prevProps, nextProps) => {
    return (prevProps.flashData === nextProps.flashData &&
        prevProps.blinkData === nextProps.blinkData);
});
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    calloutContainer: {
        backgroundColor: "white",
        borderRadius: 12,
        padding: 16,
        alignItems: "center",
        minWidth: 200,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    menu: {
        position: "absolute",
        right: 10,
        top: 10,
    },
    logoContainer: {
        marginBottom: 12,
        position: "relative",
    },
    logoCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors._orange,
        justifyContent: "center",
        alignItems: "center",
    },
    verifiedBadge: {
        position: "absolute",
        bottom: -2,
        right: -2,
        backgroundColor: "white",
        borderRadius: 12,
    },
    badgesContainer: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 10,
        gap: 20,
    },
}));
//# sourceMappingURL=CustomMarker.js.map