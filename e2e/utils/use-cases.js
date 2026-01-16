"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isScreenTitleShowing = exports.waitTillScreenTitleShowing = exports.enter2CentsIntoNumberPad = exports.addSmallAmount = exports.clickOnBottomTab = exports.Tab = exports.clickOnSetting = exports.waitTillSettingDisplayed = exports.waitTillOnHomeScreen = exports.clickIcon = exports.clickBackButton = void 0;
const i18n_util_1 = require("../../app/i18n/i18n-util");
const i18n_util_sync_1 = require("../../app/i18n/i18n-util.sync");
const config_1 = require("./config");
const controls_1 = require("./controls");
(0, i18n_util_sync_1.loadLocale)("en");
const LL = (0, i18n_util_1.i18nObject)("en");
const clickBackButton = async () => {
    await (0, controls_1.clickButton)("Go back");
};
exports.clickBackButton = clickBackButton;
const clickIcon = async (titleOrName) => {
    const iconButton = await $((0, controls_1.selector)(titleOrName, "Other"));
    await iconButton.waitForEnabled({ timeout: config_1.timeout });
    await iconButton.click();
};
exports.clickIcon = clickIcon;
const waitTillOnHomeScreen = async () => {
    await (0, controls_1.waitTillTextDisplayed)(LL.HomeScreen.myAccounts());
};
exports.waitTillOnHomeScreen = waitTillOnHomeScreen;
const waitTillSettingDisplayed = async (text) => {
    await (0, controls_1.waitTillTextDisplayed)(text);
};
exports.waitTillSettingDisplayed = waitTillSettingDisplayed;
const clickOnSetting = async (title) => {
    await (0, controls_1.clickOnText)(title);
};
exports.clickOnSetting = clickOnSetting;
exports.Tab = {
    Home: LL.HomeScreen.title(),
    Contacts: LL.ContactsScreen.title(),
    Map: LL.MapScreen.title(),
    Earn: LL.EarnScreen.title(),
};
const clickOnBottomTab = async (tab) => {
    await (0, controls_1.clickButton)(tab);
};
exports.clickOnBottomTab = clickOnBottomTab;
const addSmallAmount = async (LL) => {
    await (0, controls_1.clickPressable)("Amount Input Button");
    await (0, exports.enter2CentsIntoNumberPad)(LL);
    await (0, controls_1.waitTillPressableDisplayed)("Amount Input Button");
};
exports.addSmallAmount = addSmallAmount;
const enter2CentsIntoNumberPad = async (LL) => {
    await (0, controls_1.clickPressable)("Key .");
    await (0, controls_1.clickPressable)("Key 0");
    await (0, controls_1.clickPressable)("Key 2");
    await (0, controls_1.clickButton)(LL.AmountInputScreen.setAmount());
};
exports.enter2CentsIntoNumberPad = enter2CentsIntoNumberPad;
const screenTitleSelector = (title) => {
    if (process.env.E2E_DEVICE === "ios") {
        return `(//XCUIElementTypeOther[@name="${title}"])[2]`;
    }
    return `android=new UiSelector().text("${title}")`;
};
const waitTillScreenTitleShowing = async (title) => {
    const screenTitle = await $(screenTitleSelector(title));
    await screenTitle.waitForDisplayed({ timeout: config_1.timeout });
};
exports.waitTillScreenTitleShowing = waitTillScreenTitleShowing;
const isScreenTitleShowing = async (title) => {
    const screenTitle = await $(screenTitleSelector(title));
    return screenTitle.isDisplayed();
};
exports.isScreenTitleShowing = isScreenTitleShowing;
//# sourceMappingURL=use-cases.js.map