import * as React from "react"
import { PersistentStateContext } from "../../app/store/persistent-state"

const PersistentStateWrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
  <PersistentStateContext.Provider
    value={{
      persistentState: {
        schemaVersion: 7,
        galoyInstance: {
          id: "Main",
        },
        galoyAuthToken: "",
        hasInitializedBreezSDK: false,
        unclaimedDeposits: 0,
        closedQuickStartTypes: [],
      },
      updateState: () => {},
      resetState: () => {},
    }}
  >
    <>{children}</>
  </PersistentStateContext.Provider>
)

export const StoryScreen: React.FC<React.PropsWithChildren> = ({ children }) => (
  <PersistentStateWrapper>{children}</PersistentStateWrapper>
)
