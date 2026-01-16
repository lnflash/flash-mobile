"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const i18n_util_1 = require("../app/i18n/i18n-util");
const i18n_util_sync_1 = require("../app/i18n/i18n-util.sync");
const utils_1 = require("./utils");
const jimp_1 = __importDefault(require("jimp"));
const jsqr_1 = __importDefault(require("jsqr"));
(0, i18n_util_sync_1.loadLocale)("en");
const LL = (0, i18n_util_1.i18nObject)("en");
const timeout = 30000;
describe("Receive BTC Amount Payment Flow", () => {
    let invoice;
    const memo = "memo";
    it("Click Receive", async () => {
        await (0, utils_1.clickIcon)(LL.HomeScreen.receive());
    });
    it("Click Request Specific Amount", async () => {
        await (0, utils_1.waitTillPressableDisplayed)("Amount Input Button");
        await (0, utils_1.clickPressable)("Amount Input Button");
        // we need to wait for the notifications permissions pop up
        // and click allow before we can continue
        await browser.pause(4000);
    });
    it("Enter Amount", async () => {
        await (0, utils_1.enter2CentsIntoNumberPad)(LL);
    });
    it("Checks that the invoice is updated", async () => {
        const lnInvoiceReadableText = await $((0, utils_1.selector)("readable-payment-request", "Other"));
        await lnInvoiceReadableText.waitForDisplayed({ timeout });
        expect(lnInvoiceReadableText).toBeDisplayed();
    });
    it("clicks on set a note button", async () => {
        await (0, utils_1.scrollDown)();
        await (0, utils_1.clickPressable)("add-note");
    });
    it("sets a memo or note", async () => {
        const memoInput = await $((0, utils_1.selector)("add-note", "Other"));
        await memoInput.setValue(memo);
        // tap outside
        await browser.touchAction({ action: "tap", x: 10, y: 250 });
    });
    it("Click Copy BTC Invoice", async () => {
        const copyInvoiceButton = await $((0, utils_1.selector)("Copy Invoice", "StaticText"));
        await copyInvoiceButton.waitForDisplayed({ timeout });
        await copyInvoiceButton.click();
    });
    it("Get BTC Invoice from clipboard (android) or share link (ios)", async () => {
        if (process.env.E2E_DEVICE === "ios") {
            // on ios, get invoice from share link because copy does not
            // work on physical device for security reasons
            const shareButton = await $((0, utils_1.selector)("Share Invoice", "StaticText"));
            await shareButton.waitForDisplayed({ timeout });
            await shareButton.click();
            const invoiceSharedScreen = await $('//*[contains(@name,"lntbs")]');
            await invoiceSharedScreen.waitForDisplayed({
                timeout: 8000,
            });
            invoice = await invoiceSharedScreen.getAttribute("name");
            await (0, utils_1.clickButton)("Close");
        }
        else {
            // get from clipboard in android
            const invoiceBase64 = await browser.getClipboard();
            invoice = Buffer.from(invoiceBase64, "base64").toString();
            expect(invoice).toContain("lntbs");
        }
    });
    it("Capture screenshot and decode QR code to match with invoice", async () => {
        const screenshot = await browser.takeScreenshot();
        const buffer = Buffer.from(screenshot, "base64");
        const image = await jimp_1.default.read(buffer);
        const imageData = {
            data: new Uint8ClampedArray(image.bitmap.data),
            height: image.bitmap.height,
            width: image.bitmap.width,
        };
        const code = (0, jsqr_1.default)(imageData.data, imageData.width, imageData.height);
        expect(code).not.toBeNull();
        expect(code === null || code === void 0 ? void 0 : code.data).toBe(invoice.toUpperCase());
    });
    it("External User Pays the BTC Invoice through API", async () => {
        const { result, paymentStatus } = await (0, utils_1.payAmountInvoice)({ invoice, memo });
        expect(paymentStatus).toBe("SUCCESS");
        expect(result).toBeTruthy();
    });
    it("Wait for Green check for BTC Payment", async () => {
        const successCheck = await $((0, utils_1.selector)("Success Icon", "Other"));
        await successCheck.waitForDisplayed({ timeout });
    });
    it("Go back to main screen", async () => {
        await (0, utils_1.clickBackButton)();
    });
});
describe("Receive BTC Amountless Invoice Payment Flow", () => {
    let invoice;
    it("Click Receive", async () => {
        await (0, utils_1.clickIcon)(LL.HomeScreen.receive());
    });
    it("Click Copy BTC Invoice", async () => {
        const copyInvoiceButton = await $((0, utils_1.selector)("Copy Invoice", "StaticText"));
        await copyInvoiceButton.waitForDisplayed({ timeout });
        await copyInvoiceButton.click();
    });
    it("Get BTC Invoice from clipboard (android) or share link (ios)", async () => {
        if (process.env.E2E_DEVICE === "ios") {
            // on ios, get invoice from share link because copy does not
            // work on physical device for security reasons
            const shareButton = await $((0, utils_1.selector)("Share Invoice", "StaticText"));
            await shareButton.waitForDisplayed({ timeout });
            await shareButton.click();
            const invoiceSharedScreen = await $('//*[contains(@name,"lntbs")]');
            await invoiceSharedScreen.waitForDisplayed({
                timeout: 8000,
            });
            invoice = await invoiceSharedScreen.getAttribute("name");
            const closeShareButton = await $((0, utils_1.selector)("Close", "Button"));
            await closeShareButton.waitForDisplayed({ timeout });
            await closeShareButton.click();
        }
        else {
            // get from clipboard in android
            const invoiceBase64 = await browser.getClipboard();
            invoice = Buffer.from(invoiceBase64, "base64").toString();
            expect(invoice).toContain("lntbs");
        }
    });
    it("Capture screenshot and decode QR code to match with invoice", async () => {
        const screenshot = await browser.takeScreenshot();
        const buffer = Buffer.from(screenshot, "base64");
        const image = await jimp_1.default.read(buffer);
        const imageData = {
            data: new Uint8ClampedArray(image.bitmap.data),
            height: image.bitmap.height,
            width: image.bitmap.width,
        };
        const code = (0, jsqr_1.default)(imageData.data, imageData.width, imageData.height);
        expect(code).not.toBeNull();
        expect(code === null || code === void 0 ? void 0 : code.data).toBe(invoice.toUpperCase());
    });
    it("External User Pays the BTC Invoice through API", async () => {
        const { result, paymentStatus } = await (0, utils_1.payNoAmountInvoice)({
            invoice,
            walletCurrency: "BTC",
        });
        expect(paymentStatus).toBe("SUCCESS");
        expect(result).toBeTruthy();
    });
    it("Wait for Green check for BTC Payment", async () => {
        const successCheck = await $((0, utils_1.selector)("Success Icon", "Other"));
        await successCheck.waitForExist({ timeout });
    });
});
describe("Receive USD Payment Flow", () => {
    let invoice;
    it("Click Receive", async () => {
        await (0, utils_1.clickIcon)(LL.HomeScreen.receive());
    });
    it("Click USD invoice button", async () => {
        const usdInvoiceButton = await $((0, utils_1.selector)(LL.ReceiveScreen.stablesats(), "Other"));
        await usdInvoiceButton.waitForDisplayed({ timeout });
        await usdInvoiceButton.click();
    });
    it("Click Copy BTC Invoice", async () => {
        const copyInvoiceButton = await $((0, utils_1.selector)("Copy Invoice", "StaticText"));
        await copyInvoiceButton.waitForDisplayed({ timeout });
        await copyInvoiceButton.click();
    });
    it("Get BTC Invoice from clipboard (android) or share link (ios)", async () => {
        if (process.env.E2E_DEVICE === "ios") {
            // on ios, get invoice from share link because copy does not
            // work on physical device for security reasons
            const shareButton = await $((0, utils_1.selector)("Share Invoice", "StaticText"));
            await shareButton.waitForDisplayed({ timeout });
            await shareButton.click();
            const invoiceSharedScreen = await $('//*[contains(@name,"lntbs")]');
            await invoiceSharedScreen.waitForDisplayed({
                timeout: 8000,
            });
            invoice = await invoiceSharedScreen.getAttribute("name");
            const closeShareButton = await $((0, utils_1.selector)("Close", "Button"));
            await closeShareButton.waitForDisplayed({ timeout });
            await closeShareButton.click();
        }
        else {
            // get from clipboard in android
            const invoiceBase64 = await browser.getClipboard();
            invoice = Buffer.from(invoiceBase64, "base64").toString();
            expect(invoice).toContain("lntbs");
        }
    });
    it("Capture screenshot and decode QR code to match with invoice", async () => {
        const screenshot = await browser.takeScreenshot();
        const buffer = Buffer.from(screenshot, "base64");
        const image = await jimp_1.default.read(buffer);
        const imageData = {
            data: new Uint8ClampedArray(image.bitmap.data),
            height: image.bitmap.height,
            width: image.bitmap.width,
        };
        const code = (0, jsqr_1.default)(imageData.data, imageData.width, imageData.height);
        expect(code).not.toBeNull();
        expect(code === null || code === void 0 ? void 0 : code.data).toBe(invoice.toUpperCase());
    });
    it("External User Pays the BTC Invoice through API", async () => {
        const { result, paymentStatus } = await (0, utils_1.payNoAmountInvoice)({
            invoice,
            walletCurrency: "BTC",
        });
        expect(paymentStatus).toBe("SUCCESS");
        expect(result).toBeTruthy();
    });
    it("Wait for Green check for BTC Payment", async () => {
        const successCheck = await $((0, utils_1.selector)("Success Icon", "Other"));
        await successCheck.waitForExist({ timeout });
    });
    it("Go back to main screen", async () => {
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
describe("Receive via Onchain", () => {
    let invoice;
    it("Click Receive", async () => {
        await (0, utils_1.clickIcon)(LL.HomeScreen.receive());
    });
    it("Click Onchain button", async () => {
        const onchainButton = await $((0, utils_1.selector)(LL.ReceiveScreen.onchain(), "StaticText"));
        await onchainButton.waitForDisplayed({ timeout });
        await onchainButton.click();
    });
    it("Click Copy BTC Invoice", async () => {
        const copyInvoiceButton = await $((0, utils_1.selector)("Copy Invoice", "StaticText"));
        await copyInvoiceButton.waitForDisplayed({ timeout });
        await copyInvoiceButton.click();
    });
    it("Get BTC Invoice from clipboard (android) or share link (ios)", async () => {
        if (process.env.E2E_DEVICE === "ios") {
            // on ios, get invoice from share link because copy does not
            // work on physical device for security reasons
            const shareButton = await $((0, utils_1.selector)("Share Invoice", "StaticText"));
            await shareButton.waitForDisplayed({ timeout });
            await shareButton.click();
            const invoiceSharedScreen = await $('//*[contains(@name,"bitcoin:tb1")]');
            await invoiceSharedScreen.waitForDisplayed({
                timeout: 8000,
            });
            invoice = await invoiceSharedScreen.getAttribute("name");
            const closeShareButton = await $((0, utils_1.selector)("Close", "Button"));
            await closeShareButton.waitForDisplayed({ timeout });
            await closeShareButton.click();
        }
        else {
            // get from clipboard in android
            const invoiceBase64 = await browser.getClipboard();
            invoice = Buffer.from(invoiceBase64, "base64").toString();
            expect(invoice).toContain("bitcoin:tb1");
        }
    });
    it("Capture screenshot and decode QR code to match with invoice", async () => {
        const screenshot = await browser.takeScreenshot();
        const buffer = Buffer.from(screenshot, "base64");
        const image = await jimp_1.default.read(buffer);
        const imageData = {
            data: new Uint8ClampedArray(image.bitmap.data),
            height: image.bitmap.height,
            width: image.bitmap.width,
        };
        const code = (0, jsqr_1.default)(imageData.data, imageData.width, imageData.height);
        expect(code).not.toBeNull();
        expect(code === null || code === void 0 ? void 0 : code.data).toBe(invoice);
    });
    it("Go back to main screen", async () => {
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
describe("Receive via Onchain on USD", () => {
    let invoice;
    it("Click Receive", async () => {
        await (0, utils_1.clickIcon)(LL.HomeScreen.receive());
        await browser.pause(5000);
    });
    it("Click Onchain button", async () => {
        const onchainButton = await $((0, utils_1.selector)(LL.ReceiveScreen.onchain(), "StaticText"));
        await onchainButton.waitForDisplayed({ timeout });
        await onchainButton.click();
    });
    it("Click USD invoice button", async () => {
        const usdInvoiceButton = await $((0, utils_1.selector)(LL.ReceiveScreen.stablesats(), "Other"));
        await usdInvoiceButton.waitForDisplayed({ timeout });
        await usdInvoiceButton.click();
    });
    it("Click Copy BTC Invoice", async () => {
        const copyInvoiceButton = await $((0, utils_1.selector)("Copy Invoice", "StaticText"));
        await copyInvoiceButton.waitForDisplayed({ timeout });
        await copyInvoiceButton.click();
    });
    it("Get BTC Invoice from clipboard (android) or share link (ios)", async () => {
        if (process.env.E2E_DEVICE === "ios") {
            // on ios, get invoice from share link because copy does not
            // work on physical device for security reasons
            const shareButton = await $((0, utils_1.selector)("Share Invoice", "StaticText"));
            await shareButton.waitForDisplayed({ timeout });
            await shareButton.click();
            const invoiceSharedScreen = await $('//*[contains(@name,"bitcoin:tb1")]');
            await invoiceSharedScreen.waitForDisplayed({
                timeout: 8000,
            });
            invoice = await invoiceSharedScreen.getAttribute("name");
            const closeShareButton = await $((0, utils_1.selector)("Close", "Button"));
            await closeShareButton.waitForDisplayed({ timeout });
            await closeShareButton.click();
        }
        else {
            // get from clipboard in android
            const invoiceBase64 = await browser.getClipboard();
            invoice = Buffer.from(invoiceBase64, "base64").toString();
            expect(invoice).toContain("bitcoin:tb1");
        }
    });
    it("Capture screenshot and decode QR code to match with invoice", async () => {
        const screenshot = await browser.takeScreenshot();
        const buffer = Buffer.from(screenshot, "base64");
        const image = await jimp_1.default.read(buffer);
        const imageData = {
            data: new Uint8ClampedArray(image.bitmap.data),
            height: image.bitmap.height,
            width: image.bitmap.width,
        };
        const code = (0, jsqr_1.default)(imageData.data, imageData.width, imageData.height);
        expect(code).not.toBeNull();
        expect(code === null || code === void 0 ? void 0 : code.data).toBe(invoice);
    });
    it("Go back to main screen", async () => {
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
describe("Receive via Paycode", () => {
    it("Click Receive", async () => {
        await (0, utils_1.clickIcon)(LL.HomeScreen.receive());
    });
    it("Click Paycode button", async () => {
        const paycodeButton = await $((0, utils_1.selector)(LL.ReceiveScreen.paycode(), "StaticText"));
        await paycodeButton.waitForDisplayed({ timeout });
        await paycodeButton.click();
    });
    // we can't reliably test paycode qr because username needs to have been set
    // which is conditional - can be set or for new accounts might not be set
    it("Go back to main screen", async () => {
        await (0, utils_1.clickBackButton)();
        await (0, utils_1.waitTillOnHomeScreen)();
    });
});
//# sourceMappingURL=05-payments-receive-flow.e2e.spec.js.map