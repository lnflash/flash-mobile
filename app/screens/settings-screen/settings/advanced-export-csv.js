"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportCsvSetting = void 0;
const react_native_share_1 = __importDefault(require("react-native-share"));
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const i18n_react_1 = require("@app/i18n/i18n-react");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const row_1 = require("../row");
const hooks_1 = require("@app/hooks");
(0, client_1.gql) `
  query ExportCsvSetting($walletIds: [WalletId!]!) {
    me {
      id
      defaultAccount {
        id
        csvTransactions(walletIds: $walletIds)
      }
    }
  }
`;
const ExportCsvSetting = () => {
    var _a, _b;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { data, loading } = (0, generated_1.useSettingsScreenQuery)();
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    const btcWalletId = btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.id;
    const usdWalletId = usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.id;
    const [fetchCsvTransactionsQuery, { loading: spinner }] = (0, generated_1.useWalletCsvTransactionsLazyQuery)({
        fetchPolicy: "network-only",
    });
    const fetchCsvTransactions = async () => {
        var _a, _b;
        const walletIds = [];
        // if (btcWalletId) walletIds.push(btcWalletId)
        if (usdWalletId)
            walletIds.push(usdWalletId);
        const { data } = await fetchCsvTransactionsQuery({
            variables: { walletIds },
        });
        const csvEncoded = (_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.csvTransactions;
        try {
            await react_native_share_1.default.open({
                title: "flash-transactions",
                filename: "flash-transactions",
                url: `data:text/comma-separated-values;base64,${csvEncoded}`,
                type: "text/comma-separated-values",
            });
        }
        catch (err) {
            if (err instanceof Error) {
                (0, crashlytics_1.getCrashlytics)().recordError(err);
            }
            console.error(err);
        }
    };
    return (<row_1.SettingsRow loading={loading} spinner={spinner} title={LL.common.csvExport()} leftIcon="download-outline" rightIcon={null} action={fetchCsvTransactions}/>);
};
exports.ExportCsvSetting = ExportCsvSetting;
//# sourceMappingURL=advanced-export-csv.js.map