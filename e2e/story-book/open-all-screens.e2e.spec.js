"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("e2e/utils");
const clickNavigator = async () => {
    const navigator = $(`//*[contains(@text, 'NAVIGATOR')]`);
    await navigator.waitForDisplayed();
    await navigator.click();
    await browser.pause(1000);
};
const clickUpperRightQuadrant = async () => {
    const { height, width } = await browser.getWindowRect();
    const x = width - width / 4;
    const y = height / 4;
    return browser.touchAction({
        action: "tap",
        x,
        y,
    });
};
const openAndCloseStory = async (story) => {
    await story.waitForDisplayed();
    await story.click();
    await clickUpperRightQuadrant();
    await browser.pause(2000);
    await clickNavigator();
};
const openAllStoriesOnScreen = async (lastSeenStory) => {
    var _a;
    const visibleStories = await $$(`//*[contains(@content-desc,"Storybook.ListItem")]`);
    const lastSeenStoryIndex = visibleStories.findIndex((story) => story.elementId === lastSeenStory);
    const newStories = visibleStories.slice(lastSeenStoryIndex + 1);
    for (const story of newStories) {
        await openAndCloseStory(story);
    }
    return (_a = newStories[newStories.length - 1]) === null || _a === void 0 ? void 0 : _a.elementId;
};
describe("Storybook screens", () => {
    it("should all open", async () => {
        await clickNavigator();
        let lastSeenStory = null;
        do {
            lastSeenStory = await openAllStoriesOnScreen(lastSeenStory);
            await (0, utils_1.scrollDownOnLeftSideOfScreen)();
        } while (lastSeenStory);
    });
});
//# sourceMappingURL=open-all-screens.e2e.spec.js.map