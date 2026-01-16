"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@app/config");
it("get a full object with BBW", () => {
    const res = (0, config_1.resolveGaloyInstanceOrDefault)({ id: "Main" });
    expect(res).toBe(config_1.GALOY_INSTANCES[0]);
});
it("get a full object with Staging", () => {
    const res = (0, config_1.resolveGaloyInstanceOrDefault)({ id: "Staging" });
    expect(res).toBe(config_1.GALOY_INSTANCES[1]);
});
it("get a full object with Custom", () => {
    const CustomInstance = {
        id: "Custom",
        name: "Custom",
        graphqlUri: "https://api.custom.com/graphql",
        graphqlWsUri: "ws://ws.custom.com/graphql",
        authUrl: "https://api.custom.com",
        posUrl: "https://pay.custom.com/",
        lnAddressHostname: "custom.com",
        blockExplorer: "https://mempool.space/tx/",
    };
    const res = (0, config_1.resolveGaloyInstanceOrDefault)(CustomInstance);
    expect(res).toBe(CustomInstance);
});
//# sourceMappingURL=galoy-instances.spec.js.map