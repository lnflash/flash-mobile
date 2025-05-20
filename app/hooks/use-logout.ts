import AsyncStorage from "@react-native-async-storage/async-storage"
import messaging from "@react-native-firebase/messaging"

// store
import { resetUserSlice } from "@app/store/redux/slices/userSlice"

// hooks
import { useApolloClient } from "@apollo/client"
import { useUserLogoutMutation } from "@app/graphql/generated"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useAppDispatch } from "@app/store/redux"
import { useFlashcard } from "./useFlashcard"

// utils
import KeyStoreWrapper from "../utils/storage/secureStorage"
import { SCHEMA_VERSION_KEY } from "@app/config"

const useLogout = () => {
  const client = useApolloClient()
  const dispatch = useAppDispatch()
  const { resetState } = usePersistentStateContext()
  const { resetFlashcard } = useFlashcard()

  const [userLogoutMutation] = useUserLogoutMutation({
    fetchPolicy: "no-cache",
  })

  const logout = async (stateToDefault = true) => {
    try {
      const deviceToken = await messaging().getToken()
      userLogoutMutation({ variables: { input: { deviceToken } } })
        .then(async (res) => {
          console.log("USER LOGOUT MUTATION RES: ", res.data?.userLogout)
          if (res.data?.userLogout.success) {
            cleanUp()
          }
        })
        .catch((err) => {
          console.log("USER LOGOUT MUTATION ERR: ", err)
        })
    } catch (err: unknown) {
      console.log("USER LOGOUT MUTATION ERR CATCH: ", err)
    }
  }

  const cleanUp = async () => {
    await client.cache.reset()
    await AsyncStorage.multiRemove([SCHEMA_VERSION_KEY])
    await KeyStoreWrapper.removeIsBiometricsEnabled()
    await KeyStoreWrapper.removePin()
    await KeyStoreWrapper.removePinAttempts()
    dispatch(resetUserSlice())
    resetState()
    resetFlashcard()
  }

  return {
    logout,
    cleanUp,
  }
}

export default useLogout
