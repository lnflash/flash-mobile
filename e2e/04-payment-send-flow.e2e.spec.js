"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bech32_1 = require("bech32");
const i18n_util_1 = require("../app/i18n/i18n-util");
const i18n_util_sync_1 = require("../app/i18n/i18n-util.sync");
const utils_1 = require("./utils");
(0, i18n_util_sync_1.loadLocale)("en");
const LL = (0, i18n_util_1.i18nObject)("en");
const timeout = 30000;
describe("Lightning address flow", () => {
    const lightningAddress = "extheo@testlnurl.netlify.app";
    it("Click Send", async () => {
        await (0, utils_1.clickIcon)(LL.HomeScreen.send());
    });
    it("Paste Lnurl", async () => {
        const lnurlInput = await $((0, utils_1.selector)(LL.SendBitcoinScreen.placeholder(), "Other", "[1]"));
        await lnurlInput.waitForDisplayed({ timeout });
        await lnurlInput.click();
        await lnurlInput.setValue(lightningAddress);
    });
    it("Click Next", async () => {
        await (0, utils_1.clickButton)(LL.common.next());
    });
    it("Checks if on the SendBitcoinDetails screen", async () => {
        await (0, utils_1.waitTillPressableDisplayed)("Amount Input Button");
    });
    it("Go back", async () => {
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillTextDisplayed)(LL.SendBitcoinScreen.destination());
    });
    it("Go back home", async () => {
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
describe("Lnurl Pay Flow", () => {
    // see https://github.com/Extheoisah/lnurl-json for reference to lnurl json
    const words = bech32_1.bech32.toWords(Buffer.from("https://testlnurl.netlify.app:443/.well-known/lnurlp/extheo", "utf-8"));
    const lnurlp = bech32_1.bech32.encode("lnurl", words, 1000);
    // lnurl1dp68gurn8ghj7ar9wd6xcmn4wfkzumn9w3kxjene9eshqup6xs6rxtewwajkcmpdddhx7amw9akxuatjd3cz7etcw35x2mcql20cc
    it("Click Send", async () => {
        await (0, utils_1.clickIcon)(LL.HomeScreen.send());
    });
    it("Paste Lnurl", async () => {
        const lnurlInput = await $((0, utils_1.selector)(LL.SendBitcoinScreen.placeholder(), "Other", "[1]"));
        await lnurlInput.waitForDisplayed({ timeout });
        await lnurlInput.click();
        await lnurlInput.setValue(lnurlp);
    });
    it("Click Next", async () => {
        await (0, utils_1.clickButton)(LL.common.next());
    });
    it("Checks if on the SendBitcoinDetails screen", async () => {
        await (0, utils_1.waitTillPressableDisplayed)("Amount Input Button");
    });
    it("Go back", async () => {
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillTextDisplayed)(LL.SendBitcoinScreen.destination());
    });
    it("Go back home", async () => {
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
describe("Lnurl Withdraw Flow", () => {
    // see https://github.com/Extheoisah/lnurl-json for reference to lnurl json
    const words = bech32_1.bech32.toWords(Buffer.from("https://testlnurl.netlify.app/lnurl-withdraw/lnwithdrawresponse.json", "utf-8"));
    const lnurlWithdraw = bech32_1.bech32.encode("lnurl", words, 1000);
    it("Click Send", async () => {
        await (0, utils_1.clickIcon)(LL.HomeScreen.send());
    });
    it("Paste Lnurl", async () => {
        const lnurlInput = await $((0, utils_1.selector)(LL.SendBitcoinScreen.placeholder(), "Other", "[1]"));
        await lnurlInput.waitForDisplayed({ timeout });
        await lnurlInput.click();
        await lnurlInput.setValue(lnurlWithdraw);
    });
    it("Click Next", async () => {
        await (0, utils_1.clickButton)(LL.common.next());
    });
    it("Checks if lnwithdraw details are displayed", async () => {
        const description = await $((0, utils_1.selector)("description", "StaticText"));
        await description.waitForDisplayed({ timeout });
        await (0, utils_1.waitTillButtonDisplayed)("Redeem Bitcoin");
    });
    it("Go back", async () => {
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillTextDisplayed)(LL.SendBitcoinScreen.destination());
    });
    it("Go back home", async () => {
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
describe("Lightning Payments Flow", () => {
    let invoice;
    it("Click Send", async () => {
        await (0, utils_1.clickIcon)(LL.HomeScreen.send());
    });
    it("Create Invoice from API", async () => {
        invoice = await (0, utils_1.getInvoice)();
        expect(invoice).toContain("lntbs");
    });
    it("Paste Invoice", async () => {
        const invoiceInput = await $((0, utils_1.selector)(LL.SendBitcoinScreen.placeholder(), "Other", "[1]"));
        await invoiceInput.waitForDisplayed({ timeout });
        await invoiceInput.click();
        await invoiceInput.setValue(invoice);
    });
    it("Click Next", async () => {
        await (0, utils_1.clickButton)(LL.common.next());
    });
    it("Add amount", async () => {
        await (0, utils_1.addSmallAmount)(LL);
    });
    it("Click Next again", async () => {
        await (0, utils_1.clickButton)(LL.common.next());
    });
    it("Wait for fee calculation to return", async () => {
        const feeDisplay = await $((0, utils_1.selector)("Successful Fee", "StaticText"));
        await feeDisplay.waitForDisplayed({ timeout });
    });
    it("Click 'Confirm Payment' and navigate to move money screen", async () => {
        await (0, utils_1.clickButton)(LL.SendBitcoinConfirmationScreen.title());
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
//# sourceMappingURL=04-payment-send-flow.e2e.spec.js.map