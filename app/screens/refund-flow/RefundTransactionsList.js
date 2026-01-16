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
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const native_1 = __importDefault(require("styled-components/native"));
const themed_1 = require("@rneui/themed");
const react_native_breez_sdk_liquid_1 = require("@breeztech/react-native-breez-sdk-liquid");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_2 = require("@react-navigation/native");
const hooks_1 = require("@app/hooks");
const amounts_1 = require("@app/types/amounts");
const storage_1 = require("@app/utils/storage");
const utility_1 = require("@app/utils/utility");
const transaction_date_1 = require("@app/components/transaction-date");
const RefundTransactionsList = ({ navigation }) => {
    const { LL, locale } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { galoyInstance } = (0, hooks_1.useAppConfig)().appConfig;
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { formatDisplayAndWalletAmount } = (0, hooks_1.useDisplayCurrency)();
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [refundables, setRefundables] = (0, react_1.useState)();
    if (!convertMoneyAmount)
        return null;
    (0, native_2.useFocusEffect)((0, react_1.useCallback)(() => {
        fetchRefundables();
    }, []));
    const fetchRefundables = async () => {
        setLoading(true);
        const refundables = (await (0, react_native_breez_sdk_liquid_1.listRefundables)()) || [];
        const refundedTxs = (await (0, storage_1.loadJson)("refundedTxs")) || [];
        const merged = (0, utility_1.mergeByTimestamp)(refundables, refundedTxs);
        setRefundables(merged);
        setLoading(false);
    };
    const renderItem = ({ item }) => {
        const pressHandler = () => {
            if (!!item.txId) {
                react_native_1.Linking.openURL(galoyInstance.blockExplorer + item.txId);
            }
            else {
                navigation.navigate("RefundDestination", {
                    swapAddress: item.swapAddress,
                    amount: item.amountSat,
                });
            }
        };
        const formattedAmount = formatDisplayAndWalletAmount({
            displayAmount: convertMoneyAmount((0, amounts_1.toBtcMoneyAmount)(item.amountSat), amounts_1.DisplayCurrency),
            walletAmount: (0, amounts_1.toBtcMoneyAmount)(item.amountSat),
        });
        return (<Item colors={colors}>
        <ColumnWrapper>
          <Amount>{formattedAmount}</Amount>
          <Time color={colors.grey1}>{(0, transaction_date_1.outputRelativeDate)(item.timestamp, locale)}</Time>
        </ColumnWrapper>
        <BtnWrapper onPress={pressHandler} isRefunded={!!(item === null || item === void 0 ? void 0 : item.txId)}>
          <BtnText color={colors.white}>
            {!!(item === null || item === void 0 ? void 0 : item.txId) ? LL.RefundFlow.view() : LL.RefundFlow.refund()}
          </BtnText>
        </BtnWrapper>
      </Item>);
    };
    const renderListEmptyComp = () => {
        return (<EmptyWrapper>
        <EmptyText>{LL.RefundFlow.noRefundables()}</EmptyText>
      </EmptyWrapper>);
    };
    if (loading) {
        return (<LoadingWrapper>
        <react_native_1.ActivityIndicator color={"#60aa55"} size={"large"}/>
      </LoadingWrapper>);
    }
    else {
        return (<react_native_1.FlatList data={refundables} renderItem={renderItem} ListEmptyComponent={renderListEmptyComp()} contentContainerStyle={{ flex: 1 }}/>);
    }
};
exports.default = RefundTransactionsList;
const LoadingWrapper = native_1.default.View `
  flex: 1;
  align-items: center;
  justify-content: center;
`;
const Item = native_1.default.View `
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ colors }) => colors.grey4};
  padding-horizontal: 20px;
  padding-vertical: 10px;
`;
const ColumnWrapper = native_1.default.View ``;
const Amount = (0, native_1.default)(themed_1.Text) `
  font-size: 15px;
  margin-bottom: 5px;
`;
const Time = (0, native_1.default)(themed_1.Text) `
  font-size: 15px;
`;
const BtnWrapper = native_1.default.TouchableOpacity `
  background-color: ${({ isRefunded }) => (isRefunded ? "#fe990d" : "#60aa55")};
  border-radius: 10px;
  padding-vertical: 5px;
  padding-horizontal: 15px;
`;
const BtnText = (0, native_1.default)(themed_1.Text) `
  font-size: 16px;
`;
const EmptyWrapper = native_1.default.View `
  flex: 1;
  align-items: center;
  justify-content: center;
`;
const EmptyText = (0, native_1.default)(themed_1.Text) `
  font-size: 20px;
`;
//# sourceMappingURL=RefundTransactionsList.js.map