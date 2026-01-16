"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const themed_1 = require("@rneui/themed");
const native_1 = __importDefault(require("styled-components/native"));
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const Fees = ({ wrapperStyle, recommendedFees, selectedFeeType, onSelectFee, }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    return (<Wrapper style={wrapperStyle}>
      <Title>{LL.RefundFlow.recommendedFees()}</Title>
      <ButtonsWrapper>
        <FeeSelect colors={colors} activeOpacity={0.5} selected={selectedFeeType === "Fast"} onPress={() => onSelectFee("Fast", recommendedFees === null || recommendedFees === void 0 ? void 0 : recommendedFees.fastestFee)}>
          <FeeText colors={colors} selected={selectedFeeType === "Fast"}>
            {LL.RefundFlow.fast()}
          </FeeText>
        </FeeSelect>
        <FeeSelect colors={colors} activeOpacity={0.5} selected={selectedFeeType === "Half Hour"} onPress={() => onSelectFee("Half Hour", recommendedFees === null || recommendedFees === void 0 ? void 0 : recommendedFees.halfHourFee)}>
          <FeeText colors={colors} selected={selectedFeeType === "Half Hour"}>
            {LL.RefundFlow.halfHour()}
          </FeeText>
        </FeeSelect>
        <FeeSelect colors={colors} activeOpacity={0.5} selected={selectedFeeType === "Hour"} onPress={() => onSelectFee("Hour", recommendedFees === null || recommendedFees === void 0 ? void 0 : recommendedFees.hourFee)}>
          <FeeText colors={colors} selected={selectedFeeType === "Hour"}>
            {LL.RefundFlow.hour()}
          </FeeText>
        </FeeSelect>
      </ButtonsWrapper>
    </Wrapper>);
};
exports.default = Fees;
const Wrapper = native_1.default.View `
  margin-top: 10px;
  margin-bottom: 15px;
`;
const ButtonsWrapper = native_1.default.View `
  flex-direction: row;
  justify-content: space-between;
`;
const Title = (0, native_1.default)(themed_1.Text) `
  font-weight: bold;
  margin-bottom: 10px;
`;
const FeeSelect = native_1.default.TouchableOpacity `
  width: 30%;
  background-color: ${({ colors, selected }) => (selected ? "#60aa55" : colors.grey4)};
  border-radius: 10px;
  align-items: center;
  padding-vertical: 5px;
`;
const FeeText = native_1.default.Text `
  font-size: 15px;
  color: ${({ colors, selected }) => (selected ? colors.white : colors.black)};
`;
//# sourceMappingURL=Fees.js.map