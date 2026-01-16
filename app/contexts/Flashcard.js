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
exports.FlashcardProvider = exports.FlashcardContext = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_nfc_manager_1 = __importStar(require("react-native-nfc-manager"));
const Animatable = __importStar(require("react-native-animatable"));
const themed_1 = require("@rneui/themed");
const js_lnurl_1 = require("js-lnurl");
const axios_1 = __importDefault(require("axios"));
// components
const buttons_1 = require("@app/components/buttons");
const ActivityIndicatorContext_1 = require("./ActivityIndicatorContext");
// hooks
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const persistent_state_1 = require("@app/store/persistent-state");
// utils
const toast_1 = require("../utils/toast");
const boltcard_api_1 = require("../utils/boltcard-api");
const boltcard_url_1 = require("../utils/boltcard-url");
// assets
const nfc_scan_svg_1 = __importDefault(require("@app/assets/icons/nfc-scan.svg"));
const width = react_native_1.Dimensions.get("screen").width;
exports.FlashcardContext = (0, react_1.createContext)({
    tag: undefined,
    k1: undefined,
    callback: undefined,
    lnurl: undefined,
    balanceInSats: undefined,
    transactions: undefined,
    loading: undefined,
    error: undefined,
    // New Boltcard settings fields
    cardId: undefined,
    storeId: undefined,
    apiBaseUrl: undefined,
    settings: undefined,
    pinStatus: undefined,
    settingsLoading: undefined,
    settingsError: undefined,
    // Existing methods
    resetFlashcard: () => { },
    readFlashcard: () => { },
    // New Boltcard settings methods
    fetchSettings: async () => { },
    updateCardSettings: async () => false,
    setCardPin: async () => false,
    removeCardPin: async () => false,
    fetchPinStatus: async () => { },
    unlockCard: async () => false,
    verifyCardOwnership: async () => false,
});
const FlashcardProvider = ({ children }) => {
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const styles = useStyles();
    const { updateState, persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const [visible, setVisible] = (0, react_1.useState)(false);
    const [tag, setTag] = (0, react_1.useState)();
    const [k1, setK1] = (0, react_1.useState)();
    const [callback, setCallback] = (0, react_1.useState)();
    const [lnurl, setLnurl] = (0, react_1.useState)();
    const [balanceInSats, setBalanceInSats] = (0, react_1.useState)();
    const [transactions, setTransactions] = (0, react_1.useState)();
    const [loading, setLoading] = (0, react_1.useState)();
    const [error, setError] = (0, react_1.useState)();
    // New Boltcard settings state
    const [cardId, setCardId] = (0, react_1.useState)();
    const [storeId, setStoreId] = (0, react_1.useState)();
    const [apiBaseUrl, setApiBaseUrl] = (0, react_1.useState)();
    const [settings, setSettings] = (0, react_1.useState)();
    const [pinStatus, setPinStatus] = (0, react_1.useState)();
    const [settingsLoading, setSettingsLoading] = (0, react_1.useState)();
    const [settingsError, setSettingsError] = (0, react_1.useState)();
    (0, react_1.useEffect)(() => {
        loadFlashcard();
    }, []);
    const loadFlashcard = async () => {
        const { flashcardTag, flashcardHtml, flashcardStoreId, flashcardCardId, flashcardApiBaseUrl, } = persistentState;
        if (flashcardTag && flashcardHtml) {
            setTag(flashcardTag);
            getLnurl(flashcardHtml);
            getBalance(flashcardHtml);
            getTransactions(flashcardHtml);
            // Load Boltcard URL info from persistent state
            if (flashcardStoreId)
                setStoreId(flashcardStoreId);
            if (flashcardCardId)
                setCardId(flashcardCardId);
            if (flashcardApiBaseUrl)
                setApiBaseUrl(flashcardApiBaseUrl);
        }
    };
    const readFlashcard = async (isPayment) => {
        const isSupported = await react_native_nfc_manager_1.default.isSupported();
        const isEnabled = await react_native_nfc_manager_1.default.isEnabled();
        if (!isSupported) {
            (0, toast_1.toastShow)({
                position: "top",
                message: "NFC is not supported on this device",
                type: "error",
            });
        }
        else if (!isEnabled) {
            (0, toast_1.toastShow)({
                position: "top",
                message: "NFC is not enabled on this device.",
                type: "error",
            });
        }
        else {
            handleTag(isPayment);
        }
    };
    const handleTag = async (isPayment) => {
        var _a;
        try {
            setVisible(true);
            react_native_nfc_manager_1.default.start();
            await react_native_nfc_manager_1.default.requestTechnology(react_native_nfc_manager_1.NfcTech.Ndef);
            const tag = await react_native_nfc_manager_1.default.getTag();
            if (tag && tag.id) {
                const ndefRecord = (_a = tag === null || tag === void 0 ? void 0 : tag.ndefMessage) === null || _a === void 0 ? void 0 : _a[0];
                // eslint-disable-next-line no-negated-condition
                if (!ndefRecord) {
                    (0, toast_1.toastShow)({
                        position: "top",
                        message: "Card data not readable. Please try holding your phone closer to the card and scan again.",
                        type: "error",
                    });
                }
                else {
                    setLoading(true);
                    const payload = react_native_nfc_manager_1.Ndef.text.decodePayload(new Uint8Array(ndefRecord.payload));
                    if (payload.startsWith("lnurlw")) {
                        if (isPayment) {
                            await getPayDetails(payload);
                        }
                        else {
                            await getHtml(tag, payload);
                        }
                    }
                    setLoading(false);
                }
            }
            else {
                (0, toast_1.toastShow)({
                    position: "top",
                    message: "No card detected. Please hold your phone steady against the card and try again.",
                    type: "error",
                });
            }
        }
        catch (ex) {
            console.warn("Oops!", ex);
        }
        finally {
            cancelTechnologyRequest();
        }
    };
    const getPayDetails = async (payload) => {
        try {
            const lnurlParams = await (0, js_lnurl_1.getParams)(payload);
            if ("tag" in lnurlParams && lnurlParams.tag === "withdrawRequest") {
                const { k1, callback } = lnurlParams;
                console.log("K1>>>>>>>>>>>>>>", k1);
                console.log("CALLBACK>>>>>>>>>>>>>", callback);
                setK1(k1);
                setCallback(callback);
            }
            else {
                (0, toast_1.toastShow)({
                    position: "top",
                    message: `not a properly configured lnurl withdraw tag\n\n${payload}\n\n${"reason" in lnurlParams && lnurlParams.reason}`,
                    type: "error",
                });
            }
        }
        catch (err) {
            console.log("NFC ERROR:", err);
            (0, toast_1.toastShow)({
                position: "top",
                message: "Unsupported NFC card. Please ensure you are using a flashcard.",
                type: "error",
            });
        }
    };
    const getHtml = async (tag, payload) => {
        try {
            // Extract the full URL from the payload instead of just the query parameters
            const urlMatch = payload.match(/lnurlw?:\/\/[^?]+/);
            if (!urlMatch) {
                throw new Error("No valid URL found in payload");
            }
            let baseUrl = urlMatch[0].replace(/^lnurlw?:\/\//, "https://");
            // Convert boltcard endpoint to boltcards/balance endpoint
            if (baseUrl.includes("/boltcard")) {
                baseUrl = baseUrl.replace("/boltcard", "/boltcards/balance");
            }
            const payloadPart = payload.split("?")[1];
            const url = `${baseUrl}?${payloadPart}`;
            const response = await axios_1.default.get(url);
            const html = response.data;
            // Try to parse Boltcard URL info for settings API
            let parsedStoreId;
            let parsedCardId;
            let parsedApiBaseUrl;
            if ((0, boltcard_url_1.isFlashPluginUrl)(payload)) {
                try {
                    const urlInfo = (0, boltcard_url_1.parseBoltcardUrl)(payload, tag.id);
                    parsedStoreId = urlInfo.storeId;
                    parsedCardId = urlInfo.cardId;
                    parsedApiBaseUrl = urlInfo.baseUrl;
                    console.log("Parsed Boltcard URL info:", urlInfo);
                    // Update local state
                    setStoreId(parsedStoreId);
                    setCardId(parsedCardId);
                    setApiBaseUrl(parsedApiBaseUrl);
                }
                catch (parseErr) {
                    console.log("Could not parse Boltcard URL for settings:", parseErr);
                    // Not a fatal error - card still works, just settings won't be available
                }
            }
            updateState((state) => {
                if (state)
                    return Object.assign(Object.assign({}, state), { flashcardAdded: isAuthed ? true : undefined, flashcardTag: isAuthed ? tag : undefined, flashcardHtml: isAuthed ? html : undefined, 
                        // Store Boltcard URL info for settings API
                        flashcardStoreId: isAuthed ? parsedStoreId : undefined, flashcardCardId: isAuthed ? parsedCardId : undefined, flashcardApiBaseUrl: isAuthed ? parsedApiBaseUrl : undefined });
                return undefined;
            });
            setTag(tag);
            getLnurl(html);
            getBalance(html);
            getTransactions(html);
        }
        catch (err) {
            console.log("NFC ERROR:", err);
            (0, toast_1.toastShow)({
                position: "top",
                message: "Unsupported NFC card. Please ensure you are using a flashcard or other boltcard compatible NFC",
                type: "error",
            });
        }
    };
    const getLnurl = (html) => {
        const lnurlMatch = html.match(/href="lightning:(lnurl\w+)"/);
        if (lnurlMatch) {
            console.log("LNURL MATCH>>>>>>>>>>", lnurlMatch[1]);
            setLnurl(lnurlMatch[1]);
        }
    };
    const getBalance = (html) => {
        const balanceMatch = html.match(/(\d{1,3}(?:,\d{3})*)\s*SATS<\/dt>/);
        if (balanceMatch) {
            const parsedBalance = balanceMatch[1].replace(/,/g, ""); // Remove commas
            const satoshiAmount = parseInt(parsedBalance, 10);
            console.log("SATOSHI AMOUNT>>>>>>>>>>>>>>>", satoshiAmount);
            setBalanceInSats(satoshiAmount);
        }
    };
    const getTransactions = (html) => {
        // Extract dates and SATS amounts
        const transactionMatches = [
            ...html.matchAll(/<time datetime="(.*?)".*?>.*?<\/time>\s*<\/td>\s*<td.*?>\s*<span.*?>(-?\d{1,3}(,\d{3})*) SATS<\/span>/g),
        ];
        const data = transactionMatches.map((match) => ({
            date: match[1],
            sats: match[2], // Convert SATS value to integer
        }));
        setTransactions(data);
    };
    const cancelTechnologyRequest = () => {
        setVisible(false);
        react_native_nfc_manager_1.default.cancelTechnologyRequest();
    };
    const resetFlashcard = async () => {
        setTag(undefined);
        setK1(undefined);
        setCallback(undefined);
        setLnurl(undefined);
        setBalanceInSats(undefined);
        setTransactions(undefined);
        setLoading(undefined);
        setError(undefined);
        // Clear Boltcard settings state
        setCardId(undefined);
        setStoreId(undefined);
        setApiBaseUrl(undefined);
        setSettings(undefined);
        setPinStatus(undefined);
        setSettingsLoading(undefined);
        setSettingsError(undefined);
        updateState((state) => {
            if (state)
                return Object.assign(Object.assign({}, state), { flashcardTag: undefined, flashcardHtml: undefined, 
                    // Clear Boltcard URL info
                    flashcardStoreId: undefined, flashcardCardId: undefined, flashcardApiBaseUrl: undefined });
            return undefined;
        });
    };
    // Boltcard Settings API Methods
    /**
     * Fetch current card settings from BTCPayServer
     */
    const fetchSettings = (0, react_1.useCallback)(async () => {
        if (!apiBaseUrl || !storeId) {
            setSettingsError("Card settings not available - missing API info");
            return;
        }
        setSettingsLoading(true);
        setSettingsError(undefined);
        try {
            const fetchedSettings = await boltcard_api_1.BoltcardApi.getSettings(apiBaseUrl, storeId);
            setSettings(fetchedSettings);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Failed to fetch settings";
            setSettingsError(message);
            console.log("Error fetching Boltcard settings:", err);
        }
        finally {
            setSettingsLoading(false);
        }
    }, [apiBaseUrl, storeId]);
    /**
     * Fetch PIN status for the card
     */
    const fetchPinStatus = (0, react_1.useCallback)(async () => {
        if (!apiBaseUrl || !storeId || !cardId) {
            return;
        }
        try {
            const status = await boltcard_api_1.BoltcardApi.getPinStatus(apiBaseUrl, storeId, cardId);
            setPinStatus(status);
        }
        catch (err) {
            console.log("Error fetching PIN status:", err);
        }
    }, [apiBaseUrl, storeId, cardId]);
    /**
     * Update card settings (max withdrawal, enable/disable)
     */
    const updateCardSettings = (0, react_1.useCallback)(async (newSettings) => {
        if (!apiBaseUrl || !storeId) {
            (0, toast_1.toastShow)({
                position: "top",
                message: "Card settings not available",
                type: "error",
            });
            return false;
        }
        setSettingsLoading(true);
        try {
            const updatedSettings = await boltcard_api_1.BoltcardApi.updateSettings(apiBaseUrl, storeId, newSettings);
            setSettings(updatedSettings);
            (0, toast_1.toastShow)({
                position: "top",
                message: "Settings updated successfully",
                type: "success",
            });
            return true;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Failed to update settings";
            (0, toast_1.toastShow)({
                position: "top",
                message,
                type: "error",
            });
            return false;
        }
        finally {
            setSettingsLoading(false);
        }
    }, [apiBaseUrl, storeId]);
    /**
     * Set or update PIN for the card
     */
    const setCardPin = (0, react_1.useCallback)(async (pin) => {
        if (!apiBaseUrl || !storeId || !cardId) {
            (0, toast_1.toastShow)({
                position: "top",
                message: "Card settings not available",
                type: "error",
            });
            return false;
        }
        setSettingsLoading(true);
        try {
            await boltcard_api_1.BoltcardApi.setPin(apiBaseUrl, storeId, cardId, pin);
            // Refresh PIN status
            await fetchPinStatus();
            (0, toast_1.toastShow)({
                position: "top",
                message: "PIN set successfully",
                type: "success",
            });
            return true;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Failed to set PIN";
            (0, toast_1.toastShow)({
                position: "top",
                message,
                type: "error",
            });
            return false;
        }
        finally {
            setSettingsLoading(false);
        }
    }, [apiBaseUrl, storeId, cardId, fetchPinStatus]);
    /**
     * Remove PIN from the card
     */
    const removeCardPin = (0, react_1.useCallback)(async () => {
        if (!apiBaseUrl || !storeId || !cardId) {
            (0, toast_1.toastShow)({
                position: "top",
                message: "Card settings not available",
                type: "error",
            });
            return false;
        }
        setSettingsLoading(true);
        try {
            await boltcard_api_1.BoltcardApi.removePin(apiBaseUrl, storeId, cardId);
            // Refresh PIN status
            await fetchPinStatus();
            (0, toast_1.toastShow)({
                position: "top",
                message: "PIN removed successfully",
                type: "success",
            });
            return true;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Failed to remove PIN";
            (0, toast_1.toastShow)({
                position: "top",
                message,
                type: "error",
            });
            return false;
        }
        finally {
            setSettingsLoading(false);
        }
    }, [apiBaseUrl, storeId, cardId, fetchPinStatus]);
    /**
     * Unlock a locked card
     */
    const unlockCard = (0, react_1.useCallback)(async () => {
        if (!apiBaseUrl || !storeId || !cardId) {
            (0, toast_1.toastShow)({
                position: "top",
                message: "Card settings not available",
                type: "error",
            });
            return false;
        }
        setSettingsLoading(true);
        try {
            await boltcard_api_1.BoltcardApi.unlockCard(apiBaseUrl, storeId, cardId);
            // Refresh PIN status
            await fetchPinStatus();
            (0, toast_1.toastShow)({
                position: "top",
                message: "Card unlocked successfully",
                type: "success",
            });
            return true;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Failed to unlock card";
            (0, toast_1.toastShow)({
                position: "top",
                message,
                type: "error",
            });
            return false;
        }
        finally {
            setSettingsLoading(false);
        }
    }, [apiBaseUrl, storeId, cardId, fetchPinStatus]);
    /**
     * Verify card ownership by requiring NFC scan
     * Returns true if the scanned card matches the stored card
     */
    const verifyCardOwnership = (0, react_1.useCallback)(async () => {
        if (!(tag === null || tag === void 0 ? void 0 : tag.id)) {
            (0, toast_1.toastShow)({
                position: "top",
                message: "No card registered",
                type: "error",
            });
            return false;
        }
        return new Promise((resolve) => {
            const verifyTag = async () => {
                try {
                    setVisible(true);
                    react_native_nfc_manager_1.default.start();
                    await react_native_nfc_manager_1.default.requestTechnology(react_native_nfc_manager_1.NfcTech.Ndef);
                    const scannedTag = await react_native_nfc_manager_1.default.getTag();
                    if (scannedTag && scannedTag.id === tag.id) {
                        (0, toast_1.toastShow)({
                            position: "top",
                            message: "Card verified",
                            type: "success",
                        });
                        resolve(true);
                    }
                    else {
                        (0, toast_1.toastShow)({
                            position: "top",
                            message: "Card does not match. Please scan the correct card.",
                            type: "error",
                        });
                        resolve(false);
                    }
                }
                catch (ex) {
                    console.warn("NFC verification error:", ex);
                    (0, toast_1.toastShow)({
                        position: "top",
                        message: "Card verification failed",
                        type: "error",
                    });
                    resolve(false);
                }
                finally {
                    setVisible(false);
                    react_native_nfc_manager_1.default.cancelTechnologyRequest();
                }
            };
            verifyTag();
        });
    }, [tag]);
    return (<exports.FlashcardContext.Provider value={{
            tag,
            k1,
            callback,
            lnurl,
            balanceInSats,
            transactions,
            loading,
            error,
            // Boltcard settings
            cardId,
            storeId,
            apiBaseUrl,
            settings,
            pinStatus,
            settingsLoading,
            settingsError,
            // Methods
            resetFlashcard,
            readFlashcard,
            fetchSettings,
            updateCardSettings,
            setCardPin,
            removeCardPin,
            fetchPinStatus,
            unlockCard,
            verifyCardOwnership,
        }}>
      {children}
      {loading && <ActivityIndicatorContext_1.Loading />}
      <react_native_1.Modal animationType="slide" transparent={true} visible={visible && react_native_1.Platform.OS === "android"} onRequestClose={cancelTechnologyRequest}>
        <react_native_1.TouchableOpacity onPress={cancelTechnologyRequest} style={styles.backdrop}>
          <react_native_1.View style={styles.container}>
            <react_native_1.View style={styles.main}>
              <themed_1.Text type="h02" bold>
                Ready to Scan
              </themed_1.Text>
              <themed_1.Text type="bm">Please tap NFC tags</themed_1.Text>
              <Animatable.View animation="pulse" easing="ease-out" iterationCount="infinite">
                <nfc_scan_svg_1.default width={width / 2} height={width / 2} style={{ marginVertical: 40 }}/>
              </Animatable.View>
            </react_native_1.View>
            <buttons_1.PrimaryBtn type="clear" label="Cancel" onPress={cancelTechnologyRequest}/>
          </react_native_1.View>
        </react_native_1.TouchableOpacity>
      </react_native_1.Modal>
    </exports.FlashcardContext.Provider>);
};
exports.FlashcardProvider = FlashcardProvider;
const useStyles = (0, themed_1.makeStyles)(({ colors, mode }) => ({
    backdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: mode === "dark" ? "rgba(57,57,57,.7)" : "rgba(0,0,0,.5)",
    },
    container: {
        borderTopLeftRadius: 50,
        borderTopRightRadius: 50,
        backgroundColor: colors.white,
        padding: 20,
    },
    main: {
        alignItems: "center",
    },
}));
//# sourceMappingURL=Flashcard.js.map