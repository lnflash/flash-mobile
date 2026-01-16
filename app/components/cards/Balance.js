"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const native_1 = __importDefault(require("styled-components/native"));
const themed_1 = require("@rneui/themed");
// components
const hideable_area_1 = __importDefault(require("../hideable-area/hideable-area"));
// hooks
const generated_1 = require("@app/graphql/generated");
// assets
const cash_svg_1 = __importDefault(require("@app/assets/icons/cash.svg"));
const bitcoin_svg_1 = __importDefault(require("@app/assets/icons/bitcoin.svg"));
const flashcard_svg_1 = __importDefault(require("@app/assets/icons/flashcard.svg"));
const card_add_svg_1 = __importDefault(require("@app/assets/icons/card-add.svg"));
const sync_svg_1 = __importDefault(require("@app/assets/icons/sync.svg"));
const warning_svg_1 = __importDefault(require("@app/assets/icons/warning.svg"));
const icons = {
    cash: cash_svg_1.default,
    bitcoin: bitcoin_svg_1.default,
    flashcard: flashcard_svg_1.default,
    cardAdd: card_add_svg_1.default,
    sync: sync_svg_1.default,
    warning: warning_svg_1.default,
};
const Balance = ({ icon, title, amount, currency, emptyText, rightIcon, onPress, onPressRightBtn, }) => {
    const { colors } = (0, themed_1.useTheme)().theme;
    const { data: { hideBalance = false } = {} } = (0, generated_1.useHideBalanceQuery)();
    const Icon = icons[icon];
    const RightIcon = icons[rightIcon ? rightIcon : "sync"];
    return (<Wrapper onPress={onPress} activeOpacity={0.5} color={colors.layer}>
      <Icon color={colors.icon01}/>
      {!!amount ? (<>
          <ColumnWrapper>
            <themed_1.Text type="p4" style={{ marginBottom: 4 }} color={colors.text02}>
              {title}
            </themed_1.Text>
            <hideable_area_1.default isContentVisible={hideBalance}>
              <themed_1.Text type="h02" bold>
                {amount}{" "}
                <themed_1.Text type="h02" color={colors.text02}>
                  {currency}
                </themed_1.Text>
              </themed_1.Text>
            </hideable_area_1.default>
          </ColumnWrapper>
          {!!rightIcon && !hideBalance && (<RightBtn onPress={onPressRightBtn}>
              <RightIcon color={colors.icon01} width={30} height={30}/>
            </RightBtn>)}
        </>) : (<ColumnWrapper>
          <themed_1.Text type="h02" bold>
            {emptyText}
          </themed_1.Text>
        </ColumnWrapper>)}
    </Wrapper>);
};
exports.default = Balance;
const Wrapper = native_1.default.TouchableOpacity `
  min-height: 87px;
  flex-direction: row;
  align-items: center;
  border-radius: 20px;
  background-color: ${({ color }) => color};
  padding: 16px;
  padding-right: 0;
  margin-vertical: 5px;
`;
const ColumnWrapper = native_1.default.View `
  flex: 1;
  margin-left: 24px;
`;
const RightBtn = native_1.default.TouchableOpacity `
  padding-horizontal: 15px;
  padding-vertical: 10px;
`;
//# sourceMappingURL=Balance.js.map