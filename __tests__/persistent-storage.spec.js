"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const state_migrations_1 = require("../app/store/persistent-state/state-migrations");
it("uses default state when none is present", async () => {
    const state = await (0, state_migrations_1.migrateAndGetPersistentState)({});
    expect(state).toEqual(state_migrations_1.defaultPersistentState);
});
it("migrates persistent state", async () => {
    const state = await (0, state_migrations_1.migrateAndGetPersistentState)({
        schemaVersion: 0,
        isUsdDisabled: true,
    });
    expect(state).toEqual(Object.assign({}, state_migrations_1.defaultPersistentState));
});
it("returns default when schema is not present", async () => {
    const state = await (0, state_migrations_1.migrateAndGetPersistentState)({
        schemaVersion: -2,
    });
    expect(state).toEqual(state_migrations_1.defaultPersistentState);
});
it("migration from 5 to 6", async () => {
    const state5 = {
        schemaVersion: 5,
        galoyInstance: { id: "Main" },
        galoyAuthToken: "myToken",
    };
    const state6 = {
        schemaVersion: 6,
        galoyInstance: { id: "Main" },
        galoyAuthToken: "myToken",
    };
    const res = await (0, state_migrations_1.migrateAndGetPersistentState)(state5);
    expect(res).toStrictEqual(state6);
});
//# sourceMappingURL=persistent-storage.spec.js.map