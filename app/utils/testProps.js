"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testProps = void 0;
// This is used for E2E tests to apply id's to a <Component/>
// Usage:
//  <Button {...testProps("testID")} />
const testProps = (testID) => {
    return {
        testID,
        accessible: true,
        accessibilityLabel: testID,
    };
};
exports.testProps = testProps;
//# sourceMappingURL=testProps.js.map