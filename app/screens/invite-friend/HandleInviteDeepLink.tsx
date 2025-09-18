import { useEffect } from "react"
import { Linking, Alert } from "react-native"
import { useNavigation, NavigationProp } from "@react-navigation/native"
import { useRedeemInviteMutation, useInvitePreviewLazyQuery } from "@app/graphql/generated"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

export const useInviteDeepLink = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>()
  const [redeemInvite] = useRedeemInviteMutation()
  const [fetchInvitePreview] = useInvitePreviewLazyQuery()
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
  }, [isAuthed, navigation, redeemInvite, fetchInvitePreview])

  const handleDeepLink = async (url: string) => {

    // Only handle invite URLs
    if (!url.includes("invite")) {
      return
    }

    // Parse the URL to get the token
    // Expected format: flash://invite?token=xxxxx or https://getflash.io/invite?token=xxxxx
    const tokenRegex = /[?&]token=([a-f0-9]{40})/

    const tokenMatch = url.match(tokenRegex)
    if (!tokenMatch || !tokenMatch[1]) {
      return
    }

    const token = tokenMatch[1]

    try {
      // Store token for later use (after signup/login)
      await AsyncStorage.setItem("pendingInviteToken", token)

      // Fetch invite preview to get details
      const { data: previewData, error } = await fetchInvitePreview({
        variables: { token },
        fetchPolicy: 'network-only', // Force fresh fetch, bypass cache
        context: {
          // Add a header to indicate this is the recipient requesting their own invite
          headers: {
            'X-Invite-Recipient': 'true'
          }
        }
      })

      if (error) {
        Alert.alert("Error", "Unable to fetch invitation details. Please try again.")
        return
      }

      if (!previewData?.invitePreview?.isValid) {
        Alert.alert(
          "Invalid Invitation",
          "This invitation link is invalid or has expired.",
          [{ text: "OK" }]
        )
        return
      }

      const { contact, method, inviterUsername } = previewData.invitePreview

      // Backend now returns full contact for the intended recipient

      if (isAuthed) {
        // Existing user - show message but don't redeem
        Alert.alert(
          "Invitation for New Users",
          `This invitation from ${inviterUsername || "a friend"} is for new users only. Share it with friends who haven't joined yet!`,
          [{ text: "OK" }]
        )
      } else {
        // If not logged in, navigate to phone login flow (which handles both login and registration)
        // Store the invite details for use after successful authentication
        // Add a small delay to ensure navigation is ready
        setTimeout(() => {
          if (method === "EMAIL") {
            navigation.navigate("emailLoginInitiate", {
              inviteToken: token,
              prefilledEmail: contact,
              inviterUsername: inviterUsername || undefined
            } as any)
          } else {
            // For SMS or WHATSAPP, go to phone login flow
            navigation.navigate("phoneFlow", {
              screen: "phoneLoginInitiate",
              params: {
                inviteToken: token,
                prefilledPhone: contact,
                inviterUsername: inviterUsername || undefined
              }
            } as any)
          }
        }, 500)
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