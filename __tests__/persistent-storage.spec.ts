import {
  defaultPersistentState,
  migrateAndGetPersistentState,
} from "../app/store/persistent-state/state-migrations"

it("uses default state when none is present", async () => {
  const state = await migrateAndGetPersistentState({})
  expect(state).toEqual(defaultPersistentState)
})

it("migrates persistent state", async () => {
  const state = await migrateAndGetPersistentState({
    schemaVersion: 0,
    isUsdDisabled: true,
  })
  expect(state).toEqual({
    ...defaultPersistentState,
    galoyInstance: { id: "Main" },
  })
})

it("returns default when schema is not present", async () => {
  const state = await migrateAndGetPersistentState({
    schemaVersion: -2,
  })
  expect(state).toEqual(defaultPersistentState)
})

it("migration from 5 to current", async () => {
  const state5 = {
    schemaVersion: 5,
    galoyInstance: { id: "Main" },
    galoyAuthToken: "myToken",
  }

  const currentState = {
    schemaVersion: 7,
    galoyInstance: { id: "Main" },
    galoyAuthToken: "myToken",
    hasInitializedBreezSDK: false,
    helpTriggered: false,
    unclaimedDeposits: 0,
    closedQuickStartTypes: [],
  }

  const res = await migrateAndGetPersistentState(state5)

  expect(res).toStrictEqual(currentState)
})
