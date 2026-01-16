"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useIbexFee = void 0;
const react_1 = require("react");
const client_1 = require("@apollo/client");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const generated_1 = require("@app/graphql/generated");
(0, client_1.gql) `
  mutation lnNoAmountInvoiceFeeProbe($input: LnNoAmountInvoiceFeeProbeInput!) {
    lnNoAmountInvoiceFeeProbe(input: $input) {
      errors {
        message
      }
      amount
    }
  }

  mutation lnInvoiceFeeProbe($input: LnInvoiceFeeProbeInput!) {
    lnInvoiceFeeProbe(input: $input) {
      errors {
        message
      }
      amount
    }
  }

  mutation lnUsdInvoiceFeeProbe($input: LnUsdInvoiceFeeProbeInput!) {
    lnUsdInvoiceFeeProbe(input: $input) {
      errors {
        message
      }
      amount
    }
  }

  mutation lnNoAmountUsdInvoiceFeeProbe($input: LnNoAmountUsdInvoiceFeeProbeInput!) {
    lnNoAmountUsdInvoiceFeeProbe(input: $input) {
      errors {
        message
      }
      amount
    }
  }

  query onChainTxFee(
    $walletId: WalletId!
    $address: OnChainAddress!
    $amount: SatAmount!
  ) {
    onChainTxFee(walletId: $walletId, address: $address, amount: $amount) {
      amount
    }
  }

  query onChainUsdTxFee(
    $walletId: WalletId!
    $address: OnChainAddress!
    $amount: CentAmount!
  ) {
    onChainUsdTxFee(walletId: $walletId, address: $address, amount: $amount) {
      amount
    }
  }

  query onChainUsdTxFeeAsBtcDenominated(
    $walletId: WalletId!
    $address: OnChainAddress!
    $amount: SatAmount!
  ) {
    onChainUsdTxFeeAsBtcDenominated(
      walletId: $walletId
      address: $address
      amount: $amount
    ) {
      amount
    }
  }
`;
const useIbexFee = () => {
    const [lnInvoiceFeeProbe] = (0, generated_1.useLnInvoiceFeeProbeMutation)();
    const [lnNoAmountInvoiceFeeProbe] = (0, generated_1.useLnNoAmountInvoiceFeeProbeMutation)();
    const [lnUsdInvoiceFeeProbe] = (0, generated_1.useLnUsdInvoiceFeeProbeMutation)();
    const [lnNoAmountUsdInvoiceFeeProbe] = (0, generated_1.useLnNoAmountUsdInvoiceFeeProbeMutation)();
    const [onChainTxFee] = (0, generated_1.useOnChainTxFeeLazyQuery)();
    const [onChainUsdTxFee] = (0, generated_1.useOnChainUsdTxFeeLazyQuery)();
    const [onChainUsdTxFeeAsBtcDenominated] = (0, generated_1.useOnChainUsdTxFeeAsBtcDenominatedLazyQuery)();
    const fetchIbexFee = (0, react_1.useCallback)(async (getFeeFn) => {
        var _a;
        if (!getFeeFn) {
            return;
        }
        try {
            const feeResponse = await getFeeFn({
                lnInvoiceFeeProbe,
                lnNoAmountInvoiceFeeProbe,
                lnUsdInvoiceFeeProbe,
                lnNoAmountUsdInvoiceFeeProbe,
                onChainTxFee,
                onChainUsdTxFee,
                onChainUsdTxFeeAsBtcDenominated,
            });
            if (((_a = feeResponse.errors) === null || _a === void 0 ? void 0 : _a.length) || !feeResponse.amount) {
                return undefined;
            }
            return feeResponse.amount;
        }
        catch (err) {
            if (err instanceof Error) {
                (0, crashlytics_1.getCrashlytics)().recordError(err);
            }
            return undefined;
        }
    }, [
        lnInvoiceFeeProbe,
        lnNoAmountInvoiceFeeProbe,
        lnUsdInvoiceFeeProbe,
        lnNoAmountUsdInvoiceFeeProbe,
        onChainTxFee,
        onChainUsdTxFee,
        onChainUsdTxFeeAsBtcDenominated,
    ]);
    return fetchIbexFee;
};
exports.useIbexFee = useIbexFee;
//# sourceMappingURL=useIbexFee.js.map