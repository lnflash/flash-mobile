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
exports.withMyLnUpdateSub = exports.MyLnUpdateSub = void 0;
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const ln_update_context_1 = require("@app/graphql/ln-update-context");
const react_1 = __importStar(require("react"));
(0, client_1.gql) `
  subscription myLnUpdates {
    myUpdates {
      errors {
        message
      }
      update {
        ... on LnUpdate {
          paymentHash
          status
        }
      }
    }
  }
`;
const MyLnUpdateSub = ({ children }) => {
    const client = (0, client_1.useApolloClient)();
    const { data: dataSub } = (0, generated_1.useMyLnUpdatesSubscription)();
    const [lastHash, setLastHash] = (0, react_1.useState)("");
    react_1.default.useEffect(() => {
        var _a, _b;
        if (((_b = (_a = dataSub === null || dataSub === void 0 ? void 0 : dataSub.myUpdates) === null || _a === void 0 ? void 0 : _a.update) === null || _b === void 0 ? void 0 : _b.__typename) === "LnUpdate") {
            const update = dataSub.myUpdates.update;
            if (update.status === "PAID") {
                client.refetchQueries({ include: [generated_1.HomeAuthedDocument] });
                setLastHash(update.paymentHash);
            }
        }
    }, [dataSub, client]);
    return <ln_update_context_1.LnUpdateHashPaidProvider value={lastHash}>{children}</ln_update_context_1.LnUpdateHashPaidProvider>;
};
exports.MyLnUpdateSub = MyLnUpdateSub;
const withMyLnUpdateSub = (Component) => {
    return function WithMyLnUpdateSub(props) {
        return (<exports.MyLnUpdateSub>
        <Component {...props}/>
      </exports.MyLnUpdateSub>);
    };
};
exports.withMyLnUpdateSub = withMyLnUpdateSub;
//# sourceMappingURL=my-ln-updates-sub.js.map