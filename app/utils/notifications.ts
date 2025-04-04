// eslint-disable-next-line react-native/split-platform-components
import { Platform, PermissionsAndroid } from "react-native"

import { ApolloClient, gql } from "@apollo/client"
import { DeviceNotificationTokenCreateDocument } from "@app/graphql/generated"
import crashlytics from "@react-native-firebase/crashlytics"
import messaging from "@react-native-firebase/messaging"

// No op if the permission has already been requested
export const requestNotificationPermission = () => messaging().requestPermission()

gql`
  mutation deviceNotificationTokenCreate($input: DeviceNotificationTokenCreateInput!) {
    deviceNotificationTokenCreate(input: $input) {
      errors {
        message
      }
      success
    }
  }
`

// Check if Firebase messaging is available on this device
export const isFirebaseMessagingAvailable = async (): Promise<boolean> => {
  try {
    // Try to get the token with a short timeout
    const tokenPromise = messaging().getToken()

    // Create a timeout promise
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error("FCM token timeout")), 3000)
    })

    // Race the token retrieval against the timeout
    await Promise.race([tokenPromise, timeoutPromise])
    return true
  } catch (err) {
    console.log("Firebase messaging not available", err)
    return false
  }
}

// Use a promise-based semaphore to prevent multiple simultaneous token uploads
let tokenUploadPromise: Promise<void> | null = null

export const addDeviceToken = async (client: ApolloClient<unknown>): Promise<void> => {
  // If there's already a token upload in progress, wait for it to complete
  if (tokenUploadPromise) {
    return tokenUploadPromise
  }

  // Create a new promise for this token upload
  tokenUploadPromise = (async () => {
    try {
      // First check if Firebase messaging is available
      const fcmAvailable = await isFirebaseMessagingAvailable()

      if (!fcmAvailable) {
        console.log(
          "Skipping device token registration - Firebase messaging not available",
        )
        return
      }

      const deviceToken = await messaging().getToken()
      await client.mutate({
        mutation: DeviceNotificationTokenCreateDocument,
        variables: { input: { deviceToken } },
      })
    } catch (err: unknown) {
      if (err instanceof Error) {
        crashlytics().recordError(err)
      }
      console.error(err, "impossible to upload device token")
    } finally {
      // Reset the promise when done
      tokenUploadPromise = null
    }
  })()

  return tokenUploadPromise
}

export const hasNotificationPermission = async (): Promise<boolean> => {
  // First check if messaging is available before checking permissions
  try {
    const fcmAvailable = await isFirebaseMessagingAvailable()
    if (!fcmAvailable) {
      return false
    }

    if (Platform.OS === "ios") {
      const authorizationStatus = await messaging().hasPermission()
      return (
        authorizationStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authorizationStatus === messaging.AuthorizationStatus.PROVISIONAL
      )
    }

    if (Platform.OS === "android") {
      const authorizationStatusAndroid = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      )
      return authorizationStatusAndroid === PermissionsAndroid.RESULTS.GRANTED || false
    }
  } catch (err) {
    console.log("Error checking notification permission", err)
  }

  return false
}
