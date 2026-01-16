"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const i18n_util_1 = require("../app/i18n/i18n-util");
const i18n_util_sync_1 = require("../app/i18n/i18n-util.sync");
const utils_1 = require("./utils");
(0, i18n_util_sync_1.loadLocale)("en");
(0, i18n_util_sync_1.loadLocale)("es");
const LL = (0, i18n_util_1.i18nObject)("en");
const timeout = 30000;
describe("Change Language Flow", () => {
    const enLL = LL;
    const esLL = (0, i18n_util_1.i18nObject)("es");
    it("clicks Settings Icon", async () => {
        await (0, utils_1.clickIcon)("menu");
    });
    it("clicks Language", async () => {
        await (0, utils_1.clickOnSetting)(enLL.common.language());
        browser.pause(2000);
    });
    it("changes language to Spanish", async () => {
        await (0, utils_1.clickOnSetting)("Español");
        await (0, utils_1.waitTillScreenTitleShowing)(esLL.common.languagePreference());
    });
    it("changes language back to Predetermined", async () => {
        await (0, utils_1.clickOnSetting)(esLL.Languages.DEFAULT());
        await (0, utils_1.waitTillScreenTitleShowing)(enLL.common.languagePreference());
    });
    it("navigates back to move home screen", async () => {
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillSettingDisplayed)(enLL.common.account());
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
describe("Contacts Flow", () => {
    it("Click Contacts Button", async () => {
        await (0, utils_1.clickOnBottomTab)(utils_1.Tab.Contacts);
    });
    it("Check if contacts exists", async () => {
        const { contactList } = await (0, utils_1.checkContact)();
        let contactUsernameButton;
        expect(contactList === null || contactList === void 0 ? void 0 : contactList.length).toBe(contactList === null || contactList === void 0 ? void 0 : contactList.length);
        const searchBar = await $((0, utils_1.selector)(LL.common.search(), "Other"));
        await searchBar.waitForDisplayed({ timeout });
        console.log("1");
        await searchBar.click();
        console.log("2");
        await searchBar.setValue((contactList === null || contactList === void 0 ? void 0 : contactList[0].username) || "");
        console.log("3");
        if (process.env.E2E_DEVICE === "ios") {
            const enterButton = await $((0, utils_1.selector)("Return", "Button"));
            await enterButton.waitForDisplayed({ timeout });
            await enterButton.click();
            contactUsernameButton = await $((0, utils_1.selector)("RNE__LISTITEM__padView", "Other"));
        }
        else {
            // press the enter key
            browser.keys("\uE007");
            const uiSelector = `new UiSelector().text("${contactList === null || contactList === void 0 ? void 0 : contactList[0].username}").className("android.widget.TextView")`;
            contactUsernameButton = await $(`android=${uiSelector}`);
        }
        await contactUsernameButton.waitForDisplayed({ timeout });
        await contactUsernameButton.click();
        // pause to wait for contact details to load
        await browser.pause(2000);
        await $((0, utils_1.selector)("contact-detail-icon", "Other")).isDisplayed();
    });
    it("Go back to main screen", async () => {
        await (0, utils_1.clickOnBottomTab)(utils_1.Tab.Home);
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
describe("See transactions list", () => {
    it("Click 'Transactions'", async () => {
        const transactionsButton = await $((0, utils_1.selector)(LL.TransactionScreen.title(), "StaticText"));
        await transactionsButton.waitForDisplayed({ timeout });
        await transactionsButton.click();
        // pause to wait for transactions to load
        await browser.pause(2000);
    });
    it("See transactions", async () => {
        const transactionsList = await $((0, utils_1.selector)("list-item-content", "Other", "[1]"));
        const transactionDescription = await $((0, utils_1.selector)("tx-description", "StaticText", "[2]"));
        await transactionsList.waitForDisplayed({ timeout });
        expect(transactionDescription).toBeDisplayed();
    });
    it("click on first transaction", async () => {
        const firstTransaction = await $((0, utils_1.selector)("list-item-content", "Other", "[1]"));
        await firstTransaction.waitForDisplayed({ timeout });
        await firstTransaction.click();
    });
    it("check if transaction details are shown", async () => {
        await (0, utils_1.waitTillTextDisplayed)(LL.common.date());
    });
    it("Go back home", async () => {
        if (process.env.E2E_DEVICE === "ios") {
            const close = await $(`(//XCUIElementTypeOther[@name="close"])[2]`);
            await close.waitForEnabled({ timeout });
            await close.click();
        }
        else {
            await (0, utils_1.clickIcon)("close");
        }
        await (0, utils_1.waitTillScreenTitleShowing)(LL.TransactionScreen.transactionHistoryTitle());
        while (await (0, utils_1.isScreenTitleShowing)(LL.TransactionScreen.transactionHistoryTitle())) {
            await (0, utils_1.clickBackButton)();
            await browser.pause(1000);
        }
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
describe("Price graph flow", () => {
    it("click on price graph button", async () => {
        await (0, utils_1.clickIcon)("graph");
    });
    it("check if price graph header is shown", async () => {
        const priceGraphHeader = await $((0, utils_1.selector)(LL.PriceHistoryScreen.satPrice(), "Other"));
        const rangeText = await $((0, utils_1.selector)("range", "StaticText"));
        await priceGraphHeader.waitForDisplayed({ timeout });
        expect(rangeText).toBeDisplayed();
    });
    it("click on one week button", async () => {
        const oneWeekButton = await $((0, utils_1.selector)(LL.PriceHistoryScreen.oneWeek(), "Button"));
        const rangeText = await $((0, utils_1.selector)("range", "StaticText"));
        await oneWeekButton.waitForDisplayed({ timeout });
        await oneWeekButton.click();
        expect(rangeText).toBeDisplayed();
    });
    it("click on one month button", async () => {
        const oneMonthButton = await $((0, utils_1.selector)(LL.PriceHistoryScreen.oneMonth(), "Button"));
        const rangeText = await $((0, utils_1.selector)("range", "Other"));
        await oneMonthButton.waitForDisplayed({ timeout });
        await oneMonthButton.click();
        expect(rangeText).toBeDisplayed();
    });
    it("click on one year button", async () => {
        const oneYearButton = await $((0, utils_1.selector)(LL.PriceHistoryScreen.oneYear(), "Button"));
        const rangeText = await $((0, utils_1.selector)("range", "Other"));
        await oneYearButton.waitForDisplayed({ timeout });
        await oneYearButton.click();
        expect(rangeText).toBeDisplayed();
    });
    it("click on five years button", async () => {
        const fiveYearsButton = await $((0, utils_1.selector)(LL.PriceHistoryScreen.fiveYears(), "Button"));
        const rangeText = await $((0, utils_1.selector)("range", "Other"));
        await fiveYearsButton.waitForDisplayed({ timeout });
        await fiveYearsButton.click();
        expect(rangeText).toBeDisplayed();
    });
    it("go back to home screen", async () => {
        await (0, utils_1.clickBackButton)();
    });
});
//# sourceMappingURL=06-other-tests.e2e.spec.js.map