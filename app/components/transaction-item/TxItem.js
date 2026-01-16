"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TxItem = void 0;
const react_1 = __importDefault(require("react"));
const moment_1 = __importDefault(require("moment"));
const native_1 = __importDefault(require("styled-components/native"));
const themed_1 = require("@rneui/themed");
const generated_1 = require("@app/graphql/generated");
// components
const hideable_area_1 = __importDefault(require("../hideable-area/hideable-area"));
// hooks
const native_2 = require("@react-navigation/native");
const hooks_1 = require("@app/hooks");
// assets
const arrow_up_svg_1 = __importDefault(require("@app/assets/icons/arrow-up.svg"));
const arrow_down_svg_1 = __importDefault(require("@app/assets/icons/arrow-down.svg"));
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
// utils
const amounts_1 = require("@app/types/amounts");
const label = {
    RECEIVE: "Received",
    SEND: "Sent",
};
exports.TxItem = react_1.default.memo(({ tx }) => {
    var _a;
    const navigation = (0, native_2.useNavigation)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { formatMoneyAmount, moneyAmountToDisplayCurrencyString } = (0, hooks_1.useDisplayCurrency)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { data: { hideBalance = false } = {} } = (0, generated_1.useHideBalanceQuery)();
    let primaryAmount = null;
    let secondaryAmount = null;
    if (tx.settlementCurrency === "BTC") {
        const moneyAmount = (0, amounts_1.toBtcMoneyAmount)((_a = tx.settlementAmount) !== null && _a !== void 0 ? _a : NaN);
        primaryAmount = moneyAmountToDisplayCurrencyString({
            moneyAmount,
            isApproximate: true,
        });
        secondaryAmount = formatMoneyAmount({
            moneyAmount,
        });
    }
    else {
        const amount = tx.settlementAmount * 100;
        const moneyAmount = (0, amounts_1.toUsdMoneyAmount)(amount !== null && amount !== void 0 ? amount : NaN);
        primaryAmount = moneyAmountToDisplayCurrencyString({
            moneyAmount: moneyAmount,
        });
        if (convertMoneyAmount) {
            secondaryAmount = formatMoneyAmount({
                moneyAmount: convertMoneyAmount(moneyAmount, "BTC"),
            });
        }
    }
    const onPress = () => navigation.navigate("transactionDetail", { tx });
    return (<Wrapper onPress={onPress} activeOpacity={0.5}>
      <IconWrapper borderColor={colors.border01}>
        {tx.direction === "RECEIVE" ? (<arrow_down_svg_1.default color={colors.accent02}/>) : (<arrow_up_svg_1.default color={colors.black}/>)}
      </IconWrapper>
      <ColumnWrapper>
        <RowWrapper>
          <themed_1.Text type="bl">{`${label[tx.direction]} ${tx.settlementCurrency}`}</themed_1.Text>
          {tx.status === "PENDING" && (<themed_1.Text type="caption" color={colors._orange}>
              {`  (Pending)`}
            </themed_1.Text>)}
        </RowWrapper>
        {tx.memo && (<RowWrapper style={{ marginTop: 4, marginBottom: 2 }}>
            <Ionicons_1.default name="document-text" size={16} color={colors.primary} style={{ marginRight: 4, marginTop: 1 }}/>
            <themed_1.Text type="bl" style={{
                color: colors.primary,
                fontWeight: "600",
                flex: 1,
            }} numberOfLines={2} ellipsizeMode="tail">
              {tx.memo}
            </themed_1.Text>
          </RowWrapper>)}
        <themed_1.Text type="caption" color={colors.text02}>
          {(0, moment_1.default)(moment_1.default.unix(tx.createdAt)).fromNow()}
        </themed_1.Text>
      </ColumnWrapper>
      <hideable_area_1.default isContentVisible={hideBalance}>
        <ColumnWrapper style={{ alignItems: "flex-end" }}>
          <themed_1.Text type="bl" color={tx.direction === "RECEIVE" ? colors.accent02 : colors.black}>
            {primaryAmount}
          </themed_1.Text>
          <themed_1.Text type="caption" color={colors.text02}>
            {secondaryAmount}
          </themed_1.Text>
        </ColumnWrapper>
      </hideable_area_1.default>
    </Wrapper>);
});
const Wrapper = native_1.default.TouchableOpacity `
  flex-direction: row;
  align-items: center;
  padding-vertical: 12px;
`;
const IconWrapper = native_1.default.View `
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 100px;
  border: 2px solid ${({ borderColor }) => borderColor};
  margin-right: 8px;
`;
const ColumnWrapper = native_1.default.View `
  flex: 1;
`;
const RowWrapper = native_1.default.View `
  flex-direction: row;
  align-items: center;
`;
//# sourceMappingURL=TxItem.js.map