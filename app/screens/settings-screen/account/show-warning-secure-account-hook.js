"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useShowWarningSecureAccount = void 0;
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const hooks_1 = require("@app/hooks");
const amounts_1 = require("@app/types/amounts");
(0, client_1.gql) `
  query warningSecureAccount {
    me {
      id
      defaultAccount {
        level
        id
        wallets {
          id
          balance
          walletCurrency
        }
      }
    }
  }
`;
const minimumBalance = 500; // $5
const useShowWarningSecureAccount = () => {
    var _a, _b, _c, _d;
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data } = (0, generated_1.useWarningSecureAccountQuery)({
        fetchPolicy: "cache-and-network",
        skip: !isAuthed,
    });
    if (((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.level) !== "ZERO")
        return false;
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_d = (_c = data === null || data === void 0 ? void 0 : data.me) === null || _c === void 0 ? void 0 : _c.defaultAccount) === null || _d === void 0 ? void 0 : _d.wallets);
    const usdMoneyAmount = (0, amounts_1.toUsdMoneyAmount)(usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.balance);
    const btcMoneyAmount = (0, amounts_1.toBtcMoneyAmount)(btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.balance);
    const btcBalanceInUsd = (convertMoneyAmount && convertMoneyAmount(btcMoneyAmount, "USD")) ||
        amounts_1.ZeroUsdMoneyAmount;
    const totalBalanceUsd = (0, amounts_1.addMoneyAmounts)({
        a: btcBalanceInUsd,
        b: usdMoneyAmount,
    });
    return (0, amounts_1.greaterThanOrEqualTo)({
        value: totalBalanceUsd,
        greaterThanOrEqualTo: (0, amounts_1.toUsdMoneyAmount)(minimumBalance),
    });
};
exports.useShowWarningSecureAccount = useShowWarningSecureAccount;
//# sourceMappingURL=show-warning-secure-account-hook.js.map