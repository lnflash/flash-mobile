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
exports.DefaultWalletScreen = void 0;
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const screen_1 = require("../../components/screen");
const testProps_1 = require("../../utils/testProps");
const galoy_info_1 = require("@app/components/atomic/galoy-info");
const menu_select_1 = require("@app/components/menu-select");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const hooks_1 = require("@app/hooks");
const persistent_state_1 = require("@app/store/persistent-state");
(0, client_1.gql) `
  mutation accountUpdateDefaultWalletId($input: AccountUpdateDefaultWalletIdInput!) {
    accountUpdateDefaultWalletId(input: $input) {
      errors {
        message
      }
      account {
        id
        defaultWalletId
      }
    }
  }

  query setDefaultWalletScreen {
    me {
      id
      defaultAccount {
        id
        defaultWalletId
        wallets {
          id
          balance
          walletCurrency
        }
      }
    }
  }
`;
const DefaultWalletScreen = () => {
    var _a, _b, _c;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const { data } = (0, generated_1.useSetDefaultWalletScreenQuery)({
        fetchPolicy: "cache-first",
        skip: !isAuthed,
    });
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    const btcWalletId = btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.id;
    const usdWalletId = usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.id;
    const defaultWalletId = ((_c = persistentState.defaultWallet) === null || _c === void 0 ? void 0 : _c.id) || usdWalletId;
    if (!usdWalletId || !btcWalletId) {
        return <themed_1.Text>{"missing walletIds"}</themed_1.Text>;
    }
    const handleSetDefaultWallet = async (id) => {
        let defaultWallet = usdWallet;
        if (id === btcWalletId) {
            defaultWallet = btcWallet;
        }
        updateState((state) => {
            if (state)
                return Object.assign(Object.assign({}, state), { defaultWallet });
            return undefined;
        });
    };
    const Wallets = [
        {
            // TODO: translation
            name: "Bitcoin",
            id: btcWalletId,
        },
        {
            name: "Cash (USD)",
            id: usdWalletId,
        },
    ];
    return (<screen_1.Screen preset="scroll">
      <menu_select_1.MenuSelect value={defaultWalletId || ""} onChange={handleSetDefaultWallet}>
        {Wallets.map(({ name, id }) => (<menu_select_1.MenuSelectItem key={id} value={id} {...(0, testProps_1.testProps)(name)}>
            {name}
          </menu_select_1.MenuSelectItem>))}
      </menu_select_1.MenuSelect>
      <react_native_1.View style={styles.containerInfo}>
        <galoy_info_1.GaloyInfo>{LL.DefaultWalletScreen.info()}</galoy_info_1.GaloyInfo>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.DefaultWalletScreen = DefaultWalletScreen;
const useStyles = (0, themed_1.makeStyles)(() => ({
    containerInfo: {
        margin: 20,
    },
}));
//# sourceMappingURL=default-wallet.js.map