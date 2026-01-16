"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useReceiveBitcoin = void 0;
const react_1 = require("react");
const index_types_1 = require("./payment/index.types");
const generated_1 = require("@app/graphql/generated");
const payment_request_creation_data_1 = require("./payment/payment-request-creation-data");
const hooks_1 = require("@app/hooks");
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const client_1 = require("@apollo/client");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const payment_request_1 = require("./payment/payment-request");
const ln_update_context_1 = require("@app/graphql/ln-update-context");
const helpers_1 = require("./payment/helpers");
const toast_1 = require("@app/utils/toast");
const i18n_react_1 = require("@app/i18n/i18n-react");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const react_native_1 = require("react-native");
const cross_fetch_1 = __importDefault(require("cross-fetch"));
const persistent_state_1 = require("@app/store/persistent-state");
(0, client_1.gql) `
  query paymentRequest {
    globals {
      network
      feesInformation {
        deposit {
          minBankFee
          minBankFeeThreshold
        }
      }
    }
    me {
      id
      username
      defaultAccount {
        id
        wallets {
          id
          balance
          walletCurrency
        }
        defaultWalletId
      }
    }
  }

  mutation lnNoAmountInvoiceCreate($input: LnNoAmountInvoiceCreateInput!) {
    lnNoAmountInvoiceCreate(input: $input) {
      errors {
        message
      }
      invoice {
        paymentHash
        paymentRequest
        paymentSecret
      }
    }
  }

  mutation lnInvoiceCreate($input: LnInvoiceCreateInput!) {
    lnInvoiceCreate(input: $input) {
      errors {
        message
      }
      invoice {
        paymentHash
        paymentRequest
        paymentSecret
        satoshis
      }
    }
  }

  mutation onChainAddressCurrent($input: OnChainAddressCurrentInput!) {
    onChainAddressCurrent(input: $input) {
      errors {
        message
      }
      address
    }
  }

  mutation lnUsdInvoiceCreate($input: LnUsdInvoiceCreateInput!) {
    lnUsdInvoiceCreate(input: $input) {
      errors {
        message
      }
      invoice {
        paymentHash
        paymentRequest
        paymentSecret
        satoshis
      }
    }
  }
`;
const useReceiveBitcoin = (initPRParams = {}) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
    const [lnNoAmountInvoiceCreate] = (0, generated_1.useLnNoAmountInvoiceCreateMutation)();
    const [lnUsdInvoiceCreate] = (0, generated_1.useLnUsdInvoiceCreateMutation)();
    const [lnInvoiceCreate] = (0, generated_1.useLnInvoiceCreateMutation)();
    const [onChainAddressCurrent] = (0, generated_1.useOnChainAddressCurrentMutation)();
    const mutations = {
        lnNoAmountInvoiceCreate,
        lnUsdInvoiceCreate,
        lnInvoiceCreate,
        onChainAddressCurrent,
    };
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const [prcd, setPRCD] = (0, react_1.useState)(null);
    const [pr, setPR] = (0, react_1.useState)(null);
    const [memoChangeText, setMemoChangeText] = (0, react_1.useState)(null);
    const [expiresInSeconds, setExpiresInSeconds] = (0, react_1.useState)(null);
    const [isSetLightningAddressModalVisible, setIsSetLightningAddressModalVisible] = (0, react_1.useState)(false);
    const toggleIsSetLightningAddressModalVisible = () => {
        setIsSetLightningAddressModalVisible(!isSetLightningAddressModalVisible);
    };
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data } = (0, generated_1.usePaymentRequestQuery)({
        fetchPolicy: "cache-first",
        skip: !isAuthed,
    });
    // forcing price refresh
    (0, generated_1.useRealtimePriceQuery)({
        fetchPolicy: "network-only",
        skip: !isAuthed,
    });
    const defaultWallet = persistentState.defaultWallet;
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    const username = (_c = data === null || data === void 0 ? void 0 : data.me) === null || _c === void 0 ? void 0 : _c.username;
    const appConfig = (0, hooks_1.useAppConfig)().appConfig;
    const posUrl = appConfig.galoyInstance.posUrl;
    const lnAddressHostname = appConfig.galoyInstance.lnAddressHostname;
    const { convertMoneyAmount: _convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    // Initialize Payment Request Creation Data
    (0, react_1.useLayoutEffect)(() => {
        var _a, _b;
        if (prcd === null &&
            _convertMoneyAmount &&
            defaultWallet &&
            posUrl &&
            ((_a = data === null || data === void 0 ? void 0 : data.globals) === null || _a === void 0 ? void 0 : _a.network)) {
            const defaultWalletDescriptor = {
                currency: defaultWallet.walletCurrency,
                id: defaultWallet.id,
            };
            let bitcoinWalletDescriptor = undefined;
            if (persistentState.isAdvanceMode && btcWallet) {
                bitcoinWalletDescriptor = {
                    currency: btcWallet.walletCurrency,
                    id: btcWallet.id,
                };
            }
            const initialPRParams = Object.assign({ type: index_types_1.Invoice.Lightning, defaultWalletDescriptor,
                bitcoinWalletDescriptor, convertMoneyAmount: _convertMoneyAmount, username: username || undefined, posUrl, network: (_b = data.globals) === null || _b === void 0 ? void 0 : _b.network }, initPRParams);
            setPRCD((0, payment_request_creation_data_1.createPaymentRequestCreationData)(initialPRParams));
        }
    }, [
        _convertMoneyAmount,
        defaultWallet,
        btcWallet,
        username,
        persistentState.isAdvanceMode,
    ]);
    // Initialize Payment Request
    (0, react_1.useLayoutEffect)(() => {
        if (prcd) {
            setPR((0, payment_request_1.createPaymentRequest)({
                mutations,
                creationData: prcd,
            }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        prcd === null || prcd === void 0 ? void 0 : prcd.type,
        prcd === null || prcd === void 0 ? void 0 : prcd.unitOfAccountAmount,
        prcd === null || prcd === void 0 ? void 0 : prcd.memo,
        prcd === null || prcd === void 0 ? void 0 : prcd.receivingWalletDescriptor,
        prcd === null || prcd === void 0 ? void 0 : prcd.username,
        setPR,
    ]);
    // Generate Payment Request
    (0, react_1.useLayoutEffect)(() => {
        if (pr && pr.state === index_types_1.PaymentRequestState.Idle) {
            setPR((pq) => pq && pq.setState(index_types_1.PaymentRequestState.Loading));
            pr.generateRequest().then((newPR) => setPR((currentPR) => {
                // don't override payment request if the request is from different request
                if ((currentPR === null || currentPR === void 0 ? void 0 : currentPR.creationData) === newPR.creationData)
                    return newPR;
                return currentPR;
            }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pr === null || pr === void 0 ? void 0 : pr.state]);
    // Setting it to idle would trigger last useEffect hook to regenerate invoice
    const regenerateInvoice = () => {
        if (expiresInSeconds === 0)
            setPR((pq) => pq && pq.setState(index_types_1.PaymentRequestState.Idle));
    };
    // If Username updates
    (0, react_1.useEffect)(() => {
        if (username && username !== null && username !== (prcd === null || prcd === void 0 ? void 0 : prcd.username)) {
            setPRCD((prcd) => prcd && prcd.setUsername(username));
        }
    }, [username, prcd === null || prcd === void 0 ? void 0 : prcd.username, setPRCD]);
    // For Detecting Paid
    const lastHash = (0, ln_update_context_1.useLnUpdateHashPaid)();
    (0, react_1.useEffect)(() => {
        var _a, _b;
        if ((pr === null || pr === void 0 ? void 0 : pr.state) === index_types_1.PaymentRequestState.Created &&
            ((_b = (_a = pr.info) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.invoiceType) === "Lightning" &&
            lastHash === pr.info.data.paymentHash) {
            setPR((pq) => pq && pq.setState(index_types_1.PaymentRequestState.Paid));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastHash]);
    // For Expires In
    (0, react_1.useLayoutEffect)(() => {
        var _a, _b, _c, _d;
        if (((_b = (_a = pr === null || pr === void 0 ? void 0 : pr.info) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.invoiceType) === "Lightning" && ((_d = (_c = pr.info) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.expiresAt)) {
            let intervalId = undefined;
            const setExpiresTime = () => {
                var _a, _b, _c, _d;
                const currentTime = new Date();
                const expiresAt = ((_b = (_a = pr === null || pr === void 0 ? void 0 : pr.info) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.invoiceType) === "Lightning" && ((_d = (_c = pr.info) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.expiresAt);
                if (!expiresAt)
                    return;
                const remainingSeconds = Math.floor((expiresAt.getTime() - currentTime.getTime()) / 1000);
                if (remainingSeconds >= 0) {
                    setExpiresInSeconds(remainingSeconds);
                }
                else {
                    clearInterval(intervalId);
                    setExpiresInSeconds(0);
                    setPR((pq) => pq && pq.setState(index_types_1.PaymentRequestState.Expired));
                }
            };
            setExpiresTime();
            intervalId = setInterval(setExpiresTime, 1000);
            return () => {
                clearInterval(intervalId);
                setExpiresInSeconds(null);
            };
        }
    }, [(_d = pr === null || pr === void 0 ? void 0 : pr.info) === null || _d === void 0 ? void 0 : _d.data, setExpiresInSeconds]);
    // Clean Memo
    (0, react_1.useLayoutEffect)(() => {
        if (memoChangeText === "") {
            setPRCD((pr) => {
                if (pr && pr.setMemo) {
                    return pr.setMemo("");
                }
                return pr;
            });
        }
    }, [memoChangeText, setPRCD]);
    const { copyToClipboard, share } = (0, react_1.useMemo)(() => {
        var _a, _b;
        if (!pr) {
            return {};
        }
        const paymentFullUri = (_b = (_a = pr.info) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.getFullUriFn({});
        const copyToClipboard = () => {
            if (!paymentFullUri)
                return;
            clipboard_1.default.setString(paymentFullUri);
            let msgFn;
            if (pr.creationData.type === index_types_1.Invoice.OnChain)
                msgFn = (translations) => translations.ReceiveScreen.copyClipboardBitcoin();
            else if (pr.creationData.type === index_types_1.Invoice.PayCode)
                msgFn = (translations) => translations.ReceiveScreen.copyClipboardPaycode();
            else
                msgFn = (translations) => translations.ReceiveScreen.copyClipboard();
            (0, toast_1.toastShow)({
                message: msgFn,
                currentTranslation: LL,
                type: "success",
            });
        };
        const share = async () => {
            if (!paymentFullUri)
                return;
            try {
                const result = await react_native_1.Share.share({ message: paymentFullUri });
                if (result.action === react_native_1.Share.sharedAction) {
                    if (result.activityType) {
                        // shared with activity type of result.activityType
                    }
                    else {
                        // shared
                    }
                }
                else if (result.action === react_native_1.Share.dismissedAction) {
                    // dismissed
                }
            }
            catch (err) {
                if (err instanceof Error) {
                    (0, crashlytics_1.getCrashlytics)().recordError(err);
                    react_native_1.Alert.alert(err.message);
                }
            }
        };
        return {
            copyToClipboard,
            share,
        };
    }, [pr, LL]);
    const receiveViaNFC = (0, react_1.useCallback)(async (destination) => {
        var _a, _b, _c;
        if (((_b = (_a = pr === null || pr === void 0 ? void 0 : pr.info) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.invoiceType) !== "Lightning" || !pr.info.data.paymentRequest) {
            react_native_1.Alert.alert(LL.RedeemBitcoinScreen.error());
            return;
        }
        const { callback, k1 } = destination.validDestination;
        const urlObject = new URL(callback);
        const searchParams = urlObject.searchParams;
        searchParams.set("k1", k1);
        searchParams.set("pr", pr.info.data.paymentRequest);
        const url = urlObject.toString();
        const result = await (0, cross_fetch_1.default)(url);
        const lnurlResponse = await result.json();
        if (result.ok) {
            if (((_c = lnurlResponse === null || lnurlResponse === void 0 ? void 0 : lnurlResponse.status) === null || _c === void 0 ? void 0 : _c.toLowerCase()) !== "ok") {
                console.error(lnurlResponse, "error with redeeming");
                react_native_1.Alert.alert(lnurlResponse.reason || LL.RedeemBitcoinScreen.redeemingError());
            }
        }
        else if ((lnurlResponse.reason && lnurlResponse.reason.includes("not within bounds")) ||
            lnurlResponse.reason.includes("Amount is bigger than the maximum")) {
            react_native_1.Alert.alert("Payment Failed: Insufficient Funds");
        }
        else {
            react_native_1.Alert.alert(lnurlResponse.reason || LL.RedeemBitcoinScreen.submissionError());
        }
    }, [LL.RedeemBitcoinScreen, pr]);
    if (!prcd)
        return null;
    const setType = (type) => {
        setPRCD((pr) => pr && pr.setType(type));
        setPRCD((pr) => {
            if (pr && pr.setMemo) {
                return pr.setMemo("");
            }
            return pr;
        });
        setMemoChangeText("");
    };
    const setMemo = () => {
        setPRCD((pr) => {
            if (pr && memoChangeText && pr.setMemo) {
                return pr.setMemo(memoChangeText);
            }
            return pr;
        });
    };
    const setReceivingWallet = (walletCurrency) => {
        setPRCD((pr) => {
            if (pr && pr.setReceivingWalletDescriptor) {
                if (walletCurrency === generated_1.WalletCurrency.Btc &&
                    persistentState.isAdvanceMode &&
                    btcWallet) {
                    return pr.setReceivingWalletDescriptor({
                        id: btcWallet.id,
                        currency: generated_1.WalletCurrency.Btc,
                    });
                }
                else if (walletCurrency === generated_1.WalletCurrency.Usd && usdWallet) {
                    return pr.setReceivingWalletDescriptor({
                        id: usdWallet.id,
                        currency: generated_1.WalletCurrency.Usd,
                    });
                }
            }
            return pr;
        });
    };
    const setAmount = (amount) => {
        setPRCD((pr) => {
            if (pr && pr.setAmount) {
                return pr.setAmount(amount);
            }
            return pr;
        });
    };
    let extraDetails = "";
    if (prcd.type === "Lightning" &&
        expiresInSeconds !== null &&
        typeof expiresInSeconds === "number" &&
        (pr === null || pr === void 0 ? void 0 : pr.state) !== index_types_1.PaymentRequestState.Paid) {
        if (expiresInSeconds > 60 * 60 * 23)
            extraDetails = `${LL.ReceiveScreen.singleUse()} | ${LL.ReceiveScreen.invoiceValidity.validFor1Day()}`;
        else if (expiresInSeconds > 60 * 60 * 6)
            extraDetails = `${LL.ReceiveScreen.singleUse()} | ${LL.ReceiveScreen.invoiceValidity.validForNext({ duration: (0, helpers_1.secondsToH)(expiresInSeconds) })}`;
        else if (expiresInSeconds > 60 * 2)
            extraDetails = `${LL.ReceiveScreen.singleUse()} | ${LL.ReceiveScreen.invoiceValidity.validBefore({
                time: (0, helpers_1.generateFutureLocalTime)(expiresInSeconds),
            })}`;
        else if (expiresInSeconds > 0)
            extraDetails = `${LL.ReceiveScreen.singleUse()} | ${LL.ReceiveScreen.invoiceValidity.expiresIn({
                duration: (0, helpers_1.secondsToHMS)(expiresInSeconds),
            })}`;
        else if ((pr === null || pr === void 0 ? void 0 : pr.state) === index_types_1.PaymentRequestState.Expired)
            extraDetails = LL.ReceiveScreen.invoiceExpired();
        else
            extraDetails = `${LL.ReceiveScreen.singleUse()} | ${LL.ReceiveScreen.invoiceValidity.expiresNow()}`;
    }
    else if (prcd.type === "Lightning" && (pr === null || pr === void 0 ? void 0 : pr.state) === index_types_1.PaymentRequestState.Paid) {
        extraDetails = LL.ReceiveScreen.invoiceHasBeenPaid();
    }
    else if (prcd.type === "OnChain" && ((_f = (_e = pr === null || pr === void 0 ? void 0 : pr.info) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.invoiceType) === "OnChain") {
        extraDetails = LL.ReceiveScreen.yourBitcoinOnChainAddress();
    }
    else if (prcd.type === "PayCode" && ((_h = (_g = pr === null || pr === void 0 ? void 0 : pr.info) === null || _g === void 0 ? void 0 : _g.data) === null || _h === void 0 ? void 0 : _h.invoiceType) === "PayCode") {
        extraDetails = LL.ReceiveScreen.payCodeOrLNURL();
    }
    let readablePaymentRequest = "";
    if (((_k = (_j = pr === null || pr === void 0 ? void 0 : pr.info) === null || _j === void 0 ? void 0 : _j.data) === null || _k === void 0 ? void 0 : _k.invoiceType) === index_types_1.Invoice.Lightning) {
        const uri = (_m = (_l = pr.info) === null || _l === void 0 ? void 0 : _l.data) === null || _m === void 0 ? void 0 : _m.getFullUriFn({});
        readablePaymentRequest = `${uri.slice(0, 10)}..${uri.slice(-10)}`;
    }
    else if (((_p = (_o = pr === null || pr === void 0 ? void 0 : pr.info) === null || _o === void 0 ? void 0 : _o.data) === null || _p === void 0 ? void 0 : _p.invoiceType) === index_types_1.Invoice.OnChain) {
        const address = ((_r = (_q = pr.info) === null || _q === void 0 ? void 0 : _q.data) === null || _r === void 0 ? void 0 : _r.address) || "";
        readablePaymentRequest = `${address.slice(0, 10)}..${address.slice(-10)}`;
    }
    else if (prcd.type === "PayCode" && ((_t = (_s = pr === null || pr === void 0 ? void 0 : pr.info) === null || _s === void 0 ? void 0 : _s.data) === null || _t === void 0 ? void 0 : _t.invoiceType) === "PayCode") {
        readablePaymentRequest = `${pr.info.data.username}@${lnAddressHostname}`;
    }
    return Object.assign(Object.assign(Object.assign(Object.assign({}, prcd), { setType }), pr), { extraDetails,
        regenerateInvoice,
        setMemo,
        setReceivingWallet,
        setAmount, feesInformation: (_u = data === null || data === void 0 ? void 0 : data.globals) === null || _u === void 0 ? void 0 : _u.feesInformation, memoChangeText,
        setMemoChangeText,
        copyToClipboard,
        share,
        isSetLightningAddressModalVisible,
        toggleIsSetLightningAddressModalVisible,
        readablePaymentRequest,
        receiveViaNFC });
};
exports.useReceiveBitcoin = useReceiveBitcoin;
//# sourceMappingURL=use-receive-bitcoin.js.map