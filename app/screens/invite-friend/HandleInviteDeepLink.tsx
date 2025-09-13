import { useEffect } from "react"
import { Linking, Alert } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { useRedeemInviteMutation } from "@app/graphql/generated"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useIsAuthed } from "@app/graphql/is-authed-context"

export const useInviteDeepLink = () => {
  const navigation = useNavigation()
  const [redeemInvite] = useRedeemInviteMutation()
  const isAuthed = useIsAuthed()

  useEffect(() => {
    // Handle initial URL (when app is opened from link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url)
      }
    })

    // Handle URL changes (when app is already open)
    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url)
    })

    return () => {
      subscription.remove()
    }
  }, [isAuthed, navigation, redeemInvite])

  const handleDeepLink = async (url: string) => {
    // Parse the URL to get the token
    // Expected format: flash://invite?token=xxxxx
    const regex = /[?&]token=([a-f0-9]{40})/
    const match = url.match(regex)
    
    if (!match || !match[1]) {
      return
    }
    
    const token = match[1]
    
    try {
      // Store token for later use (after signup/login)
      await AsyncStorage.setItem("pendingInviteToken", token)
      
      if (isAuthed) {
        // If logged in, redeem the invite immediately
        const { data } = await redeemInvite({
          variables: {
            input: { token }
          }
        })
        
        if (data?.redeemInvite?.success) {
          Alert.alert(
            "Welcome!",
            "You've successfully accepted the invitation.",
            [{ text: "OK" }]
          )
        } else if (data?.redeemInvite?.errors?.[0]) {
          Alert.alert("Error", data.redeemInvite.errors[0])
        }
      } else {
        // If not logged in, navigate to signup/login with the token
        navigation.navigate("getStarted", { inviteToken: token } as any)
      }
    } catch (error) {
      console.error("Error handling invite deep link:", error)
      Alert.alert("Error", "Unable to process invitation. Please try again.")
    }
  }
}

// Helper function to check and redeem pending invite after login
export const redeemPendingInvite = async (
  redeemInviteMutation: any,
  showAlert = true
) => {
  try {
    const token = await AsyncStorage.getItem("pendingInviteToken")
    
    if (!token) {
      return { success: false, message: "No pending invite" }
    }
    
    // Call the redeemInvite mutation
    const { data } = await redeemInviteMutation({
      variables: {
        input: { token }
      }
    })
    
    // Clear the token after attempting redemption
    await AsyncStorage.removeItem("pendingInviteToken")
    
    if (data?.redeemInvite?.success) {
      if (showAlert) {
        Alert.alert(
          "Welcome!",
          "You've successfully accepted the invitation and joined through a referral.",
          [{ text: "OK" }]
        )
      }
      return { success: true, message: "Invite redeemed successfully" }
    } else if (data?.redeemInvite?.errors?.[0]) {
      const errorMessage = data.redeemInvite.errors[0]
      // Only show alert for non-duplicate errors
      if (showAlert && !errorMessage.includes("already been used")) {
        Alert.alert("Notice", errorMessage)
      }
      return { success: false, message: errorMessage }
    }
    
    return { success: false, message: "Unknown error" }
  } catch (error) {
    console.error("Error redeeming pending invite:", error)
    return { success: false, message: "Error redeeming invite" }
  }
}