"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const i18n_util_1 = require("../app/i18n/i18n-util");
const i18n_util_sync_1 = require("../app/i18n/i18n-util.sync");
const utils_1 = require("./utils");
(0, i18n_util_sync_1.loadLocale)("en");
const LL = (0, i18n_util_1.i18nObject)("en");
const timeout = 30000;
describe("Validate Username Flow", () => {
    const username = "unclesamtoshi";
    const lnAddress = "unclesamtoshi@pay.staging.galoy.io";
    it("Click Send", async () => {
        await (0, utils_1.clickIcon)(LL.HomeScreen.send());
    });
    it("Paste Username", async () => {
        const usernameInput = await $((0, utils_1.selector)(LL.SendBitcoinScreen.placeholder(), "Other", "[1]"));
        await usernameInput.waitForDisplayed({ timeout });
        await usernameInput.click();
        await usernameInput.setValue(username);
        await (0, utils_1.clickButton)(LL.common.next());
    });
    it("Confirm Username", async () => {
        // Some kind of bug with the component
        const selectorValue = process.env.E2E_DEVICE === "ios"
            ? `${LL.SendBitcoinDestinationScreen.confirmModal.checkBox({
                lnAddress,
            })} ${LL.SendBitcoinDestinationScreen.confirmModal.checkBox({ lnAddress })}`
            : LL.SendBitcoinDestinationScreen.confirmModal.checkBox({ lnAddress });
        const checkBoxButton = await $((0, utils_1.selector)(selectorValue, "Other"));
        await checkBoxButton.waitForEnabled({ timeout });
        await checkBoxButton.click();
        const { isContactAvailable } = await (0, utils_1.checkContact)(username);
        expect(isContactAvailable).toBe(false);
        await (0, utils_1.clickButton)(LL.SendBitcoinDestinationScreen.confirmModal.confirmButton());
        await (0, utils_1.waitTillTextDisplayed)(LL.SendBitcoinScreen.amount());
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillTextDisplayed)(LL.SendBitcoinScreen.destination());
    });
    it("Go back home", async () => {
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
describe("Username Payment Flow", () => {
    const username = "galoytest";
    it("Click Send", async () => {
        await (0, utils_1.clickIcon)(LL.HomeScreen.send());
    });
    it("Paste Username", async () => {
        const usernameInput = await $((0, utils_1.selector)(LL.SendBitcoinScreen.placeholder(), "Other", "[1]"));
        await usernameInput.waitForDisplayed({ timeout });
        await usernameInput.click();
        await usernameInput.setValue(username);
    });
    it("Click Next", async () => {
        const { isContactAvailable } = await (0, utils_1.checkContact)(username);
        expect(isContactAvailable).toBeTruthy();
        await (0, utils_1.clickButton)(LL.common.next());
    });
    it("Wallet contains balances", async () => {
        const btcWalletBalance = await $((0, utils_1.selector)("BTC Wallet Balance", "StaticText"));
        await btcWalletBalance.waitForDisplayed({ timeout });
        expect(btcWalletBalance).toBeDisplayed();
        const btcWalletBalanceInUsdValue = await btcWalletBalance.getText();
        expect(btcWalletBalanceInUsdValue).toHaveText(new RegExp("^\\$\\d{1,3}(,\\d{3})*(\\.\\d{1,2})?\\s\\(\\d{1,3}(,\\d{3})*\\ssats\\)$"));
    });
    it("Add amount", async () => {
        await (0, utils_1.addSmallAmount)(LL);
    });
    it("Click Next again", async () => {
        await (0, utils_1.clickButton)(LL.common.next());
    });
    it("Click 'Confirm Payment' and get Green Checkmark success", async () => {
        await (0, utils_1.clickButton)(LL.SendBitcoinConfirmationScreen.title());
    });
    it("Clicks on not enjoying app", async () => {
        await browser.pause(3000);
        const contexts = await browser.getContexts();
        const nativeContext = contexts.find((context) => context.toString().toLowerCase().includes("native"));
        await browser.pause(3000);
        if (nativeContext) {
            await browser.switchContext(nativeContext.toString());
        }
        if (process.env.E2E_DEVICE === "android") {
            await driver.back();
        }
        const appContext = contexts.find((context) => context.toString().toLowerCase().includes("webview"));
        if (appContext) {
            await browser.switchContext(appContext.toString());
        }
    });
    it("Checks for suggestion modal and skips", async () => {
        const suggestionInput = await $((0, utils_1.selector)(LL.SendBitcoinScreen.suggestionInput(), "TextView"));
        await suggestionInput.waitForDisplayed({ timeout });
        await suggestionInput.click();
        await suggestionInput.setValue("e2e test suggestion");
        await (0, utils_1.clickButton)(LL.AuthenticationScreen.skip());
        // FIXME: this is a bug. we should not have to double tap here.
        await browser.pause(1000);
        await (0, utils_1.clickButton)(LL.AuthenticationScreen.skip());
    });
});
describe("Conversion Flow", () => {
    if (process.env.E2E_DEVICE === "ios") {
        return;
    }
    it("Click on Transfer Button", async () => {
        await (0, utils_1.clickIcon)(LL.ConversionDetailsScreen.title());
    });
    it("Add amount", async () => {
        await (0, utils_1.addSmallAmount)(LL);
    });
    it("Click Next", async () => {
        await (0, utils_1.clickButton)(LL.common.next());
    });
    it("Click on Convert", async () => {
        await (0, utils_1.clickButton)(LL.common.convert());
    });
    it("Get Green Checkmark Success Icon and Navigate to HomeScreen", async () => {
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
//# sourceMappingURL=03-intraledger-flow.e2e.spec.js.map