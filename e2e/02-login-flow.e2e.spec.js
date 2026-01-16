"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const i18n_util_1 = require("../app/i18n/i18n-util");
const i18n_util_sync_1 = require("../app/i18n/i18n-util.sync");
const utils_1 = require("./utils");
const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
describe("Login Flow", () => {
    (0, i18n_util_sync_1.loadLocale)("en");
    const LL = (0, i18n_util_1.i18nObject)("en");
    const timeout = 30000;
    let email = "";
    let inboxId = "";
    it("clicks Settings Icon", async () => {
        await (0, utils_1.clickIcon)("menu");
    });
    it("taps Build version 3 times", async () => {
        // scroll down for small screens
        await (0, utils_1.waitTillSettingDisplayed)(LL.SettingsScreen.logInOrCreateAccount());
        await (0, utils_1.scrollDown)();
        const buildButton = await $((0, utils_1.selector)("Version Build Text", "StaticText"));
        await buildButton.waitForDisplayed({ timeout });
        await buildButton.click();
        await browser.pause(100);
        await buildButton.click();
        await browser.pause(100);
        await buildButton.click();
        await browser.pause(100);
    });
    it("click staging environment", async () => {
        // scroll down for small screens
        await (0, utils_1.waitTillButtonDisplayed)("logout button");
        await (0, utils_1.scrollDown)();
        await (0, utils_1.clickButton)("Staging Button");
    });
    it("input token", async () => {
        const tokenInput = await $((0, utils_1.selector)("Input access token", process.env.E2E_DEVICE === "ios" ? "SecureTextField" : "TextField"));
        await tokenInput.waitForDisplayed({ timeout });
        await tokenInput.click();
        await tokenInput.waitUntil(tokenInput.isKeyboardShown);
        await tokenInput.setValue(utils_1.userToken);
        if (process.env.E2E_DEVICE === "ios") {
            const enterButton = await $((0, utils_1.selector)("Return", "Button"));
            await enterButton.waitForDisplayed({ timeout });
            await enterButton.click();
        }
        else {
            // press the enter key
            browser.keys("\uE007");
        }
    });
    it("click Save Changes", async () => {
        await (0, utils_1.clickButton)("Save Changes");
        await (0, utils_1.waitTillTextDisplayed)("Token Present: true");
    });
    it("click go back to settings screen", async () => {
        await (0, utils_1.clickBackButton)();
    });
    it("are we logged in?", async () => {
        // scroll up for small screens
        await (0, utils_1.scrollUp)();
        await (0, utils_1.scrollUp)();
        await (0, utils_1.clickOnSetting)(LL.common.account());
        await (0, utils_1.waitTillSettingDisplayed)(LL.common.transactionLimits());
    });
    it("adding an email", async () => {
        await (0, utils_1.clickOnSetting)(LL.AccountScreen.emailAuthentication());
        const inboxRes = await (0, utils_1.getInbox)();
        if (!inboxRes)
            throw new Error("No inbox response");
        inboxId = inboxRes.id;
        email = inboxRes.emailAddress;
        const emailInput = await $((0, utils_1.selector)(LL.EmailRegistrationInitiateScreen.placeholder(), "Other", "[1]"));
        await emailInput.waitForDisplayed({ timeout });
        await emailInput.click();
        await emailInput.setValue(email);
        await (0, utils_1.clickButton)(LL.EmailRegistrationInitiateScreen.send());
    });
    it("verifying email", async () => {
        const emailRes = await (0, utils_1.getFirstEmail)(inboxId);
        if (!emailRes)
            throw new Error("No email response");
        const { subject, body } = emailRes;
        expect(subject).toEqual("your code");
        const regex = /\b\d{6}\b/;
        const match = body.match(regex);
        if (!match)
            throw new Error("No code found in email body");
        const code = match[0];
        const placeholder = "000000";
        const codeInput = await $((0, utils_1.selector)(placeholder, "Other", "[1]"));
        await codeInput.waitForDisplayed({ timeout });
        await codeInput.click();
        await codeInput.setValue(code);
        (0, utils_1.clickAlertLastButton)(LL.common.ok());
    });
    it("log out", async () => {
        await (0, utils_1.clickOnSetting)(LL.AccountScreen.logOutAndDeleteLocalData());
        (0, utils_1.clickAlertLastButton)(LL.AccountScreen.IUnderstand());
        await sleep(250);
        (0, utils_1.clickAlertLastButton)(LL.common.ok());
    });
    it("set staging environment again", async () => {
        const buildButton = await $((0, utils_1.selector)("logo-button", "Other"));
        await buildButton.waitForDisplayed({ timeout });
        await buildButton.click();
        await browser.pause(100);
        await buildButton.click();
        await browser.pause(100);
        await buildButton.click();
        await browser.pause(100);
        // scroll down for small screens
        await (0, utils_1.waitTillButtonDisplayed)("logout button");
        await (0, utils_1.scrollDown)();
        await (0, utils_1.clickButton)("Staging Button");
        await (0, utils_1.clickButton)("Save Changes");
        await (0, utils_1.clickBackButton)();
    });
    it("log back in", async () => {
        const emailLink = await $((0, utils_1.selector)("email-button", "Other"));
        await emailLink.waitForDisplayed({ timeout });
        await emailLink.click();
        const emailInput = await $((0, utils_1.selector)(LL.EmailRegistrationInitiateScreen.placeholder(), "Other", "[1]"));
        await emailInput.waitForDisplayed({ timeout });
        await emailInput.click();
        await emailInput.setValue(email);
        await (0, utils_1.clickButton)(LL.EmailRegistrationInitiateScreen.send());
        const emailRes = await (0, utils_1.getSecondEmail)(inboxId);
        if (!emailRes)
            throw new Error("No email response");
        const { subject, body } = emailRes;
        expect(subject).toEqual("your code");
        const regex = /\b\d{6}\b/;
        const match = body.match(regex);
        if (!match)
            throw new Error("No code found in email body");
        const code = match[0];
        const placeholder = "000000";
        const codeInput = await $((0, utils_1.selector)(placeholder, "Other", "[1]"));
        await codeInput.waitForDisplayed({ timeout });
        await codeInput.click();
        await codeInput.setValue(code);
    });
});
//# sourceMappingURL=02-login-flow.e2e.spec.js.map