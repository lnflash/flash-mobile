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
exports.SVGs = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const _01_so_what_exactly_is_bitcoin_01_svg_1 = __importDefault(require("./01-so-what-exactly-is-bitcoin-01.svg"));
const _02_i_just_earned_a_sat_01_svg_1 = __importDefault(require("./02-i-just-earned-a-sat-01.svg"));
const _03_where_do_the_bitcoins_exist_01_svg_1 = __importDefault(require("./03-where-do-the-bitcoins-exist-01.svg"));
const _04_who_controls_Bitcoin_01_svg_1 = __importDefault(require("./04-who-controls-Bitcoin-01.svg"));
const _05_cant_copy_bitcoin_01_svg_1 = __importDefault(require("./05-cant-copy-bitcoin-01.svg"));
const _01_money_is_a_social_agreement_01_svg_1 = __importDefault(require("./01-money-is-a-social-agreement-01.svg"));
const _01_money_is_a_social_agreement_02_svg_1 = __importDefault(require("./01-money-is-a-social-agreement-02.svg"));
const _02_coincidence_of_wants_01_svg_1 = __importDefault(require("./02-coincidence-of-wants-01.svg"));
const _03_money_has_evolved_01_svg_1 = __importDefault(require("./03-money-has-evolved-01.svg"));
const _04_why_used_as_money_01_svg_1 = __importDefault(require("./04-why-used-as-money-01.svg"));
const _04_why_used_as_money_02_svg_1 = __importDefault(require("./04-why-used-as-money-02.svg"));
const _05_money_is_important_01_svg_1 = __importDefault(require("./05-money-is-important-01.svg"));
const _06_important_to_governments_03_svg_1 = __importDefault(require("./06-important-to-governments-03.svg"));
const _01_fiat_currency_01_svg_1 = __importDefault(require("./01-fiat-currency-01.svg"));
const _02_i_trust_my_government_01_svg_1 = __importDefault(require("./02-i-trust-my-government-01.svg"));
const _03_print_unlimited_money_01_svg_1 = __importDefault(require("./03-print-unlimited-money-01.svg"));
const _03_print_unlimited_money_02_svg_1 = __importDefault(require("./03-print-unlimited-money-02.svg"));
const _04_fiat_money_loses_value_01_svg_1 = __importDefault(require("./04-fiat-money-loses-value-01.svg"));
const _04_fiat_money_loses_value_02_svg_1 = __importDefault(require("./04-fiat-money-loses-value-02.svg"));
const _05_are_there_other_issues_01_svg_1 = __importDefault(require("./05-are-there-other-issues-01.svg"));
const _05_are_there_other_issues_02_svg_1 = __importDefault(require("./05-are-there-other-issues-02.svg"));
const _01_limited_supply_01_svg_1 = __importDefault(require("./01-limited-supply-01.svg"));
const _02_decentralized_01_svg_1 = __importDefault(require("./02-decentralized-01.svg"));
const _02_decentralized_02_svg_1 = __importDefault(require("./02-decentralized-02.svg"));
const _03_no_counterfeit_money_01_svg_1 = __importDefault(require("./03-no-counterfeit-money-01.svg"));
const _03_no_counterfeit_money_02_svg_1 = __importDefault(require("./03-no-counterfeit-money-02.svg"));
const _04_highly_divisible_01_svg_1 = __importDefault(require("./04-highly-divisible-01.svg"));
const _05_secure_part_i_01_svg_1 = __importDefault(require("./05-secure-part-i-01.svg"));
const _05_secure_part_i_02_svg_1 = __importDefault(require("./05-secure-part-i-02.svg"));
const _06_secure_part_ii_01_svg_1 = __importDefault(require("./06-secure-part-ii-01.svg"));
const _06_secure_part_ii_02_svg_1 = __importDefault(require("./06-secure-part-ii-02.svg"));
const SVGs = ({ name, width, theme }) => {
    const { width: screenWidth } = react_native_1.Dimensions.get("window");
    const rWidth = width !== null && width !== void 0 ? width : screenWidth;
    switch (name) {
        case "whatIsBitcoin":
            return <_01_so_what_exactly_is_bitcoin_01_svg_1.default width={rWidth}/>;
        case "sat":
            return <_02_i_just_earned_a_sat_01_svg_1.default width={rWidth}/>;
        case "whereBitcoinExist":
            return <_03_where_do_the_bitcoins_exist_01_svg_1.default width={rWidth}/>;
        case "whoControlsBitcoin":
            return <_04_who_controls_Bitcoin_01_svg_1.default width={rWidth}/>;
        case "copyBitcoin":
            return <_05_cant_copy_bitcoin_01_svg_1.default width={rWidth}/>;
        case "moneySocialAggrement":
            return theme === "dark" ? (<_01_money_is_a_social_agreement_02_svg_1.default width={rWidth}/>) : (<_01_money_is_a_social_agreement_01_svg_1.default width={rWidth}/>);
        case "coincidenceOfWants":
            return <_02_coincidence_of_wants_01_svg_1.default width={rWidth}/>;
        case "moneyEvolution":
            return <_03_money_has_evolved_01_svg_1.default width={rWidth}/>;
        case "whyStonesShellGold":
            return theme === "dark" ? (<_04_why_used_as_money_02_svg_1.default width={rWidth}/>) : (<_04_why_used_as_money_01_svg_1.default width={rWidth}/>);
        case "moneyIsImportant":
            return <_05_money_is_important_01_svg_1.default width={rWidth}/>;
        case "moneyImportantGovernement":
            return <_06_important_to_governments_03_svg_1.default width={rWidth}/>;
        case "WhatIsFiat":
            return <_01_fiat_currency_01_svg_1.default width={rWidth}/>;
        case "whyCareAboutFiatMoney":
            return <_02_i_trust_my_government_01_svg_1.default width={rWidth}/>;
        case "GovernementCanPrintMoney":
            return theme === "dark" ? (<_03_print_unlimited_money_02_svg_1.default width={rWidth}/>) : (<_03_print_unlimited_money_01_svg_1.default width={rWidth}/>);
        case "FiatLosesValueOverTime":
            return theme === "dark" ? (<_04_fiat_money_loses_value_02_svg_1.default width={rWidth}/>) : (<_04_fiat_money_loses_value_01_svg_1.default width={rWidth}/>);
        case "OtherIssues":
            return theme === "dark" ? (<_05_are_there_other_issues_02_svg_1.default width={rWidth}/>) : (<_05_are_there_other_issues_01_svg_1.default width={rWidth}/>);
        case "LimitedSupply":
            return <_01_limited_supply_01_svg_1.default width={rWidth}/>;
        case "Decentralized":
            return theme === "dark" ? (<_02_decentralized_02_svg_1.default width={rWidth}/>) : (<_02_decentralized_01_svg_1.default width={rWidth}/>);
        case "NoCounterfeitMoney":
            return theme === "dark" ? (<_03_no_counterfeit_money_02_svg_1.default width={rWidth}/>) : (<_03_no_counterfeit_money_01_svg_1.default width={rWidth}/>);
        case "HighlyDivisible":
            return <_04_highly_divisible_01_svg_1.default width={rWidth}/>;
        case "securePartOne":
            return theme === "dark" ? (<_05_secure_part_i_02_svg_1.default width={rWidth}/>) : (<_05_secure_part_i_01_svg_1.default width={rWidth}/>);
        case "securePartTwo":
            return theme === "dark" ? (<_06_secure_part_ii_02_svg_1.default width={rWidth}/>) : (<_06_secure_part_ii_01_svg_1.default width={rWidth}/>);
        default:
            return <react_native_1.Text>{name} does not exist</react_native_1.Text>;
    }
};
exports.SVGs = SVGs;
//# sourceMappingURL=earn-svg-factory.js.map