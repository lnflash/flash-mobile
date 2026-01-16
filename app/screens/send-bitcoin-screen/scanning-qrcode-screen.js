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
exports.ScanningQRCodeScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const react_native_vision_camera_1 = require("react-native-vision-camera");
const native_1 = require("@react-navigation/native");
// utils
const config_1 = require("@app/config");
const payment_destination_1 = require("./payment-destination");
const analytics_1 = require("@app/utils/analytics");
const index_types_1 = require("./payment-destination/index.types");
// hooks
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
// components
const screen_1 = require("../../components/screen");
const buttons_1 = require("@app/components/buttons");
const scan_1 = require("@app/components/scan");
const ScanningQRCodeScreen = () => {
    var _a, _b;
    const navigation = (0, native_1.useNavigation)();
    const route = (0, native_1.useRoute)();
    const styles = useStyles();
    const device = (0, react_native_vision_camera_1.useCameraDevice)("back", {
        physicalDevices: ["ultra-wide-angle-camera", "wide-angle-camera", "telephoto-camera"],
    });
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { hasPermission, requestPermission } = (0, react_native_vision_camera_1.useCameraPermission)();
    const [pending, setPending] = (0, react_1.useState)(false);
    (0, generated_1.useRealtimePriceQuery)({
        fetchPolicy: "network-only",
    });
    const [accountDefaultWalletQuery] = (0, generated_1.useAccountDefaultWalletLazyQuery)({
        fetchPolicy: "no-cache",
    });
    const { data } = (0, generated_1.useScanningQrCodeScreenQuery)({ skip: !(0, is_authed_context_1.useIsAuthed)() });
    const wallets = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount.wallets;
    const bitcoinNetwork = (_b = data === null || data === void 0 ? void 0 : data.globals) === null || _b === void 0 ? void 0 : _b.network;
    (0, react_1.useEffect)(() => {
        if (!hasPermission) {
            requestPermission();
        }
    }, [hasPermission, requestPermission]);
    (0, react_1.useEffect)(() => {
        navigation.setOptions({
            headerTitle: "",
            headerRight: () => (<react_native_1.TouchableOpacity style={styles.close} onPress={navigation.goBack}>
          <themed_1.Icon name={"close"} size={40} color={"#fff"} type="ionicon"/>
        </react_native_1.TouchableOpacity>),
        });
    }, [navigation]);
    const processInvoice = (0, react_1.useMemo)(() => {
        return async (data) => {
            if (pending || !wallets || !bitcoinNetwork || !data) {
                return;
            }
            try {
                setPending(true);
                const destination = await (0, payment_destination_1.parseDestination)({
                    rawInput: data,
                    myWalletIds: wallets.map((wallet) => wallet.id),
                    bitcoinNetwork,
                    lnurlDomains: config_1.LNURL_DOMAINS,
                    accountDefaultWalletQuery,
                });
                (0, analytics_1.logParseDestinationResult)(destination);
                if (destination.valid) {
                    setPending(false);
                    if (route.params && destination.validDestination.paymentType === "onchain") {
                        navigation.navigate("RefundConfirmation", {
                            swapAddress: route.params.swapAddress,
                            amount: route.params.amount,
                            destination: destination.validDestination.address,
                            fee: route.params.fee,
                            feeType: route.params.feeType,
                        });
                    }
                    else if (destination.destinationDirection === index_types_1.DestinationDirection.Send) {
                        navigation.navigate("sendBitcoinDetails", {
                            paymentDestination: destination,
                        });
                    }
                    else {
                        navigation.reset({
                            routes: [
                                {
                                    name: "Primary",
                                },
                                {
                                    name: "redeemBitcoinDetail",
                                    params: {
                                        receiveDestination: destination,
                                    },
                                },
                            ],
                        });
                    }
                }
                else {
                    react_native_1.Alert.alert(LL.ScanningQRCodeScreen.invalidTitle(), destination.invalidReason === "InvoiceExpired"
                        ? LL.ScanningQRCodeScreen.expiredContent({
                            found: data.toString(),
                        })
                        : LL.ScanningQRCodeScreen.invalidContent({
                            found: data.toString(),
                        }), [
                        {
                            text: LL.common.ok(),
                            onPress: () => setPending(false),
                        },
                    ]);
                }
            }
            catch (err) {
                if (err instanceof Error) {
                    (0, crashlytics_1.getCrashlytics)().recordError(err);
                    react_native_1.Alert.alert(err.toString(), "", [
                        {
                            text: LL.common.ok(),
                            onPress: () => setPending(false),
                        },
                    ]);
                }
            }
        };
    }, [
        LL.ScanningQRCodeScreen,
        LL.common,
        navigation,
        pending,
        bitcoinNetwork,
        wallets,
        accountDefaultWalletQuery,
    ]);
    if (!hasPermission) {
        const openSettings = () => {
            react_native_1.Linking.openSettings().catch(() => {
                react_native_1.Alert.alert(LL.ScanningQRCodeScreen.unableToOpenSettings());
            });
        };
        return (<screen_1.Screen>
        <react_native_1.View style={styles.permissionMissing}>
          <themed_1.Text type="h1" style={styles.permissionMissingText}>
            {LL.ScanningQRCodeScreen.permissionCamera()}
          </themed_1.Text>
        </react_native_1.View>
        <buttons_1.PrimaryBtn label={LL.ScanningQRCodeScreen.openSettings()} onPress={openSettings} btnStyle={{ marginHorizontal: 20, marginBottom: 20 }}/>
      </screen_1.Screen>);
    }
    else if (device === null || device === undefined) {
        return (<screen_1.Screen>
        <react_native_1.View style={styles.permissionMissing}>
          <themed_1.Text type="h1">{LL.ScanningQRCodeScreen.noCamera()}</themed_1.Text>
        </react_native_1.View>
      </screen_1.Screen>);
    }
    return (<screen_1.Screen unsafe>
      <scan_1.QRCamera device={device} processInvoice={processInvoice}/>
      <scan_1.ActionBtns processInvoice={processInvoice}/>
    </screen_1.Screen>);
};
exports.ScanningQRCodeScreen = ScanningQRCodeScreen;
const useStyles = (0, themed_1.makeStyles)(() => ({
    close: {
        height: "100%",
        justifyContent: "center",
        paddingHorizontal: 15,
    },
    permissionMissing: {
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
    },
    permissionMissingText: {
        width: "80%",
        textAlign: "center",
    },
}));
//# sourceMappingURL=scanning-qrcode-screen.js.map