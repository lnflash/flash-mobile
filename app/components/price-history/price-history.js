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
exports.PriceHistory = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_svg_1 = require("react-native-svg");
const victory_native_1 = require("victory-native");
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const testProps_1 = require("@app/utils/testProps");
const base_1 = require("@rneui/base");
const themed_1 = require("@rneui/themed");
const multiple = (currentUnit) => {
    switch (currentUnit) {
        case "USDCENT":
            return 10 ** -5;
        default:
            return 1;
    }
};
const GraphRange = {
    ONE_DAY: "ONE_DAY",
    ONE_WEEK: "ONE_WEEK",
    ONE_MONTH: "ONE_MONTH",
    ONE_YEAR: "ONE_YEAR",
    FIVE_YEARS: "FIVE_YEARS",
};
(0, client_1.gql) `
  query btcPriceList($range: PriceGraphRange!) {
    btcPriceList(range: $range) {
      timestamp
      price {
        base
        offset
        currencyUnit
      }
    }
  }
`;
const PriceHistory = () => {
    var _a;
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [graphRange, setGraphRange] = React.useState(GraphRange.ONE_DAY);
    const { error, loading, data } = (0, generated_1.useBtcPriceListQuery)({
        fetchPolicy: "no-cache",
        variables: { range: graphRange },
    });
    const priceList = (_a = data === null || data === void 0 ? void 0 : data.btcPriceList) !== null && _a !== void 0 ? _a : [];
    if (error) {
        return <themed_1.Text>{`${error}`}</themed_1.Text>;
    }
    if (loading || data === null || (data === null || data === void 0 ? void 0 : data.btcPriceList) === null) {
        return (<react_native_1.View style={styles.verticalAlignment}>
        <react_native_1.ActivityIndicator animating size="large" color={colors.primary}/>
      </react_native_1.View>);
    }
    const ranges = GraphRange[graphRange];
    const rangeTimestamps = {
        ONE_DAY: 300,
        ONE_WEEK: 1800,
        ONE_MONTH: 86400,
        ONE_YEAR: 86400,
        FIVE_YEARS: 86400,
    };
    const lastPrice = priceList && priceList[priceList.length - 1];
    if (!loading && lastPrice) {
        const timeDiff = Date.now() / 1000 - lastPrice.timestamp;
        if (timeDiff > rangeTimestamps[ranges]) {
            setGraphRange(ranges);
        }
    }
    const prices = priceList
        .filter((price) => price !== null)
        .map((price) => price);
    // FIXME: backend should be updated so that PricePoint is non-nullable
    let priceDomain = [NaN, NaN];
    const currentPriceData = prices[prices.length - 1].price;
    const startPriceData = prices[0].price;
    const price = (currentPriceData.base / 10 ** currentPriceData.offset) *
        multiple(currentPriceData.currencyUnit);
    const delta = currentPriceData.base / startPriceData.base - 1;
    const color = delta > 0 ? { color: colors.green } : { color: colors.red };
    // get min and max prices for domain
    prices.forEach((p) => {
        if (!priceDomain[0] || p.price.base < priceDomain[0])
            priceDomain[0] = p.price.base;
        if (!priceDomain[1] || p.price.base > priceDomain[1])
            priceDomain[1] = p.price.base;
    });
    priceDomain = [
        (priceDomain[0] / 10 ** startPriceData.offset) *
            multiple(startPriceData.currencyUnit),
        (priceDomain[1] / 10 ** startPriceData.offset) *
            multiple(startPriceData.currencyUnit),
    ];
    const label = () => {
        switch (graphRange) {
            case GraphRange.ONE_DAY:
                return LL.PriceHistoryScreen.last24Hours();
            case GraphRange.ONE_WEEK:
                return LL.PriceHistoryScreen.lastWeek();
            case GraphRange.ONE_MONTH:
                return LL.PriceHistoryScreen.lastMonth();
            case GraphRange.ONE_YEAR:
                return LL.PriceHistoryScreen.lastYear();
            case GraphRange.FIVE_YEARS:
                return LL.PriceHistoryScreen.lastFiveYears();
        }
    };
    const buttonStyleForRange = (buttonGraphRange) => {
        return graphRange === buttonGraphRange
            ? styles.buttonStyleTimeActive
            : styles.buttonStyleTime;
    };
    const titleStyleForRange = (titleGraphRange) => {
        return graphRange === titleGraphRange ? null : styles.titleStyleTime;
    };
    return (<react_native_1.View style={styles.verticalAlignment}>
      <react_native_1.View {...(0, testProps_1.testProps)(LL.PriceHistoryScreen.satPrice())} style={styles.textView}>
        <themed_1.Text type="p1">{LL.PriceHistoryScreen.satPrice()}</themed_1.Text>
        <themed_1.Text type="p1" bold>
          ${price.toFixed(2)}
        </themed_1.Text>
      </react_native_1.View>
      <react_native_1.View style={styles.textView}>
        <themed_1.Text type="p1" style={[styles.delta, color]}>
          {(delta * 100).toFixed(2)}%{" "}
        </themed_1.Text>
        <themed_1.Text type="p1" {...(0, testProps_1.testProps)("range")}>
          {label()}
        </themed_1.Text>
      </react_native_1.View>
      <react_native_1.View style={styles.chart}>
        <victory_native_1.VictoryChart padding={{ top: 50, bottom: 50, left: 50, right: 25 }} domainPadding={{ y: 10 }}>
          <react_native_svg_1.Defs>
            <react_native_svg_1.LinearGradient id="gradient" x1="0.5" y1="0" x2="0.5" y2="1">
              <react_native_svg_1.Stop offset="20%" stopColor={colors.primary}/>
              <react_native_svg_1.Stop offset="100%" stopColor={colors.white}/>
            </react_native_svg_1.LinearGradient>
          </react_native_svg_1.Defs>
          <victory_native_1.VictoryAxis dependentAxis standalone style={{
            axis: { strokeWidth: 0 },
            grid: {
                stroke: colors.black,
                strokeOpacity: 0.1,
                strokeWidth: 1,
                strokeDasharray: "6, 6",
            },
            tickLabels: {
                fill: colors.grey3,
                fontSize: 16,
            },
        }}/>
          <victory_native_1.VictoryArea animate={{
            duration: 500,
            easing: "expInOut",
        }} data={prices.map((index) => ({
            y: (index.price.base / 10 ** index.price.offset) *
                multiple(index.price.currencyUnit),
        }))} domain={{ y: priceDomain }} interpolation="monotoneX" style={{
            data: {
                stroke: colors.primary,
                strokeWidth: 3,
                fillOpacity: 0.3,
                fill: "url(#gradient)",
            },
        }}/>
        </victory_native_1.VictoryChart>
      </react_native_1.View>
      <react_native_1.View style={styles.pricesContainer}>
        <base_1.Button {...(0, testProps_1.testProps)(LL.PriceHistoryScreen.oneDay())} title={LL.PriceHistoryScreen.oneDay()} buttonStyle={buttonStyleForRange(GraphRange.ONE_DAY)} titleStyle={titleStyleForRange(GraphRange.ONE_DAY)} onPress={() => setGraphRange(GraphRange.ONE_DAY)}/>
        <base_1.Button {...(0, testProps_1.testProps)(LL.PriceHistoryScreen.oneWeek())} title={LL.PriceHistoryScreen.oneWeek()} buttonStyle={buttonStyleForRange(GraphRange.ONE_WEEK)} titleStyle={titleStyleForRange(GraphRange.ONE_WEEK)} onPress={() => setGraphRange(GraphRange.ONE_WEEK)}/>
        <base_1.Button {...(0, testProps_1.testProps)(LL.PriceHistoryScreen.oneMonth())} title={LL.PriceHistoryScreen.oneMonth()} buttonStyle={buttonStyleForRange(GraphRange.ONE_MONTH)} titleStyle={titleStyleForRange(GraphRange.ONE_MONTH)} onPress={() => setGraphRange(GraphRange.ONE_MONTH)}/>
        <base_1.Button {...(0, testProps_1.testProps)(LL.PriceHistoryScreen.oneYear())} title={LL.PriceHistoryScreen.oneYear()} buttonStyle={buttonStyleForRange(GraphRange.ONE_YEAR)} titleStyle={titleStyleForRange(GraphRange.ONE_YEAR)} onPress={() => setGraphRange(GraphRange.ONE_YEAR)}/>
        <base_1.Button {...(0, testProps_1.testProps)(LL.PriceHistoryScreen.fiveYears())} title={LL.PriceHistoryScreen.fiveYears()} buttonStyle={buttonStyleForRange(GraphRange.FIVE_YEARS)} titleStyle={titleStyleForRange(GraphRange.FIVE_YEARS)} onPress={() => setGraphRange(GraphRange.FIVE_YEARS)}/>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.PriceHistory = PriceHistory;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    buttonStyleTime: {
        backgroundColor: colors.transparent,
        borderRadius: 40,
        width: 48,
        height: 48,
    },
    buttonStyleTimeActive: {
        backgroundColor: colors.primary,
        borderRadius: 40,
        width: 48,
        height: 48,
    },
    chart: {
        alignSelf: "center",
        marginLeft: 0,
    },
    delta: {
        fontWeight: "bold",
    },
    pricesContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginHorizontal: 32,
    },
    textView: {
        alignSelf: "center",
        flexDirection: "row",
        marginVertical: 3,
    },
    titleStyleTime: {
        color: colors.grey3,
    },
    verticalAlignment: { flex: 1, justifyContent: "center", alignItems: "center" },
}));
//# sourceMappingURL=price-history.js.map