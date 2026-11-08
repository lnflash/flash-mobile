import { configureStore, ThunkAction, Action } from "@reduxjs/toolkit"
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux"
import rootReducer from "./reducers"
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { migrate, PERSIST_VERSION } from "./migrations"

/**
 * The last failed AsyncStorage write, until `flushPersisted` clears it.
 * redux-persist 6 swallows a failed write (`createPersistoid`'s
 * `.catch(onWriteFail)`), so a bare `persistor.flush()` resolves even when
 * nothing reached disk; this handler is the only place the failure is seen.
 */
let lastWriteError: unknown

const persistConfig = {
  key: "root",
  version: PERSIST_VERSION,
  storage: AsyncStorage,
  whitelist: ["accountUpgrade", "flashcardV2"],
  migrate,
  writeFailHandler: (err: Error) => {
    lastWriteError = err ?? new Error("the store was not written")
  },
}

const persistedReducer = persistReducer(persistConfig, rootReducer)

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
})

export const persistor = persistStore(store)

/** The persisted store could not be written to disk. */
export class PersistWriteError extends Error {
  constructor(readonly reason: "not-rehydrated" | "write-failed") {
    super(`the store was not written to disk (${reason})`)
    this.name = "PersistWriteError"
  }
}

/**
 * Writes the persisted state to disk now (ENG-826) and resolves once it is
 * there; rejects when the write failed, or when the store has not
 * rehydrated (nothing is written before it has). Use it, never a bare
 * `persistor.flush()`, where a write must not go out before its record is on
 * disk.
 */
export const flushPersisted = async (): Promise<void> => {
  const persisted = (store.getState() as { _persist?: { rehydrated?: boolean } })._persist
  if (!persisted?.rehydrated) throw new PersistWriteError("not-rehydrated")
  lastWriteError = undefined
  await persistor.flush()
  if (lastWriteError !== undefined) {
    lastWriteError = undefined
    throw new PersistWriteError("write-failed")
  }
}

export type AppDispatch = typeof store.dispatch

export type RootState = ReturnType<typeof store.getState>

export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
