"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clickOnText = exports.waitTillTextDisplayed = exports.scrollDownOnLeftSideOfScreen = exports.scrollUp = exports.scrollDown = exports.enter = exports.setInputValue = exports.swipeRight = exports.swipeLeft = exports.waitTillPressableDisplayed = exports.clickPressable = exports.waitTillButtonDisplayed = exports.clickButton = exports.clickAlertLastButton = exports.selector = void 0;
const timeout = 30000;
const selector = (id, iosType, iosExtraXPath) => {
    if (process.env.E2E_DEVICE === "ios") {
        return `//XCUIElementType${iosType}[@name="${id}"]${iosExtraXPath !== null && iosExtraXPath !== void 0 ? iosExtraXPath : ""}`;
    }
    return `~${id}`;
};
exports.selector = selector;
const findById = (id, iosType, iosExtraXPath) => {
    if (process.env.E2E_DEVICE === "ios") {
        return `//XCUIElementType${iosType}[@name="${id}"]${iosExtraXPath !== null && iosExtraXPath !== void 0 ? iosExtraXPath : ""}`;
    }
    return `id=${id}`;
};
const clickAlertLastButton = async (title) => {
    const okButtonId = process.env.E2E_DEVICE === "ios" ? title : "android:id/button1";
    const okButton = await $(findById(okButtonId, "Button"));
    await okButton.waitForDisplayed({ timeout });
    await okButton.click();
};
exports.clickAlertLastButton = clickAlertLastButton;
const clickButton = async (title) => {
    const button = await $((0, exports.selector)(title, "Button"));
    await button.waitForEnabled({ timeout });
    await button.click();
};
exports.clickButton = clickButton;
const waitTillButtonDisplayed = async (title) => {
    const button = await $((0, exports.selector)(title, "Button"));
    await button.waitForDisplayed({ timeout });
};
exports.waitTillButtonDisplayed = waitTillButtonDisplayed;
const clickPressable = async (title) => {
    const button = await $((0, exports.selector)(title, "Other"));
    await button.waitForEnabled({ timeout });
    await button.click();
};
exports.clickPressable = clickPressable;
const waitTillPressableDisplayed = async (title) => {
    const button = await $((0, exports.selector)(title, "Other"));
    await button.waitForDisplayed({ timeout });
};
exports.waitTillPressableDisplayed = waitTillPressableDisplayed;
async function swipeLeft() {
    try {
        const { height, width } = await browser.getWindowRect();
        const y = height / 2;
        const toX = width / 8;
        const fromX = width - toX;
        await browser.touchAction([
            { action: "press", x: fromX, y },
            { action: "wait", ms: 500 },
            { action: "moveTo", x: toX, y },
            "release",
        ]);
    }
    catch (err) {
        console.error(err);
    }
}
exports.swipeLeft = swipeLeft;
async function swipeRight() {
    try {
        const { height, width } = await browser.getWindowRect();
        const y = height / 2;
        const fromX = width / 8;
        const toX = width - fromX;
        await browser.touchAction([
            { action: "press", x: fromX, y },
            { action: "wait", ms: 500 },
            { action: "moveTo", x: toX, y },
            "release",
        ]);
    }
    catch (err) {
        console.error(err);
    }
}
exports.swipeRight = swipeRight;
const setInputValue = async (el, value) => {
    try {
        await el.clearValue();
        await value.split("").reduce(async (prev, current) => {
            const nextString = `${await prev}${current}`;
            await el.addValue(current);
            await el.waitUntil(
            // eslint-disable-next-line func-names
            async function () {
                const text = await el.getText();
                return text === nextString;
            }, {
                timeout: 120000,
                interval: 10,
            });
            return nextString;
        }, Promise.resolve(""));
    }
    catch (e) {
        console.log("SetInputValue Error:", e);
    }
};
exports.setInputValue = setInputValue;
const enter = async (input) => {
    if (process.env.E2E_DEVICE === "ios") {
        await input.sendKeys(["\n"]);
    }
    await browser.pressKeyCode(66);
};
exports.enter = enter;
async function scrollDown() {
    try {
        const { height, width } = await browser.getWindowRect();
        const x = width / 2;
        const toY = height / 8;
        const fromY = height - height / 8;
        await browser.touchAction([
            { action: "press", x, y: fromY },
            { action: "wait", ms: 500 },
            { action: "moveTo", x, y: toY },
            "release",
        ]);
    }
    catch (err) {
        console.error(err);
    }
}
exports.scrollDown = scrollDown;
async function scrollUp() {
    try {
        const { height, width } = await browser.getWindowRect();
        const x = width / 2;
        const toY = height - height / 4;
        const fromY = height / 4;
        await browser.touchAction([
            { action: "press", x, y: fromY },
            { action: "wait", ms: 500 },
            { action: "moveTo", x, y: toY },
            "release",
        ]);
    }
    catch (err) {
        console.error(err);
    }
}
exports.scrollUp = scrollUp;
const scrollDownOnLeftSideOfScreen = async () => {
    const { height, width } = await browser.getWindowRect();
    const x = width / 4;
    const toY = height / 2;
    const fromY = height - height / 4;
    await browser.touchAction([
        { action: "press", x, y: fromY },
        { action: "wait", ms: 500 },
        { action: "moveTo", x, y: toY },
        "release",
    ]);
};
exports.scrollDownOnLeftSideOfScreen = scrollDownOnLeftSideOfScreen;
const waitTillTextDisplayed = async (text) => {
    let elementSelector;
    if (process.env.E2E_DEVICE === "ios") {
        elementSelector = `//XCUIElementTypeStaticText[@name="${text}"]`;
    }
    else {
        elementSelector = `android=new UiSelector().text("${text}").className("android.widget.TextView")`;
    }
    const textElement = await $(elementSelector);
    await textElement.waitForDisplayed({ timeout });
};
exports.waitTillTextDisplayed = waitTillTextDisplayed;
const clickOnText = async (text) => {
    let elementSelector;
    if (process.env.E2E_DEVICE === "ios") {
        elementSelector = `//XCUIElementTypeStaticText[@name="${text}"]`;
    }
    else {
        elementSelector = `android=new UiSelector().text("${text}").className("android.widget.TextView")`;
    }
    const textElement = await $(elementSelector);
    await textElement.waitForEnabled({ timeout });
    await textElement.click();
};
exports.clickOnText = clickOnText;
//# sourceMappingURL=controls.js.map