import { useEffect, useRef } from "react"
import { Linking, Alert } from "react-native"
import { useNavigation, NavigationProp } from "@react-navigation/native"
import { useInvitePreviewLazyQuery, RedeemInviteMutationFn } from "@app/graphql/generated"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// Deep-link entry for invite redemption.
//
// The app registers ONLY the `flash://` custom scheme on both platforms, so the
// links this hook can actually receive look like `flash://invite?token=…`.
// The backend sends invitees `https://getflash.io/invite?token=…` links (custom
// schemes are not tappable in WhatsApp/SMS/email). For those links to reach the
// app, getflash.io must serve either:
//   - a landing page at /invite that redirects to flash://invite?token=… , or
//   - App Links / Universal Links assets (assetlinks.json + AASA) plus the
//     matching intent-filter/entitlement in a future release.
// Neither can be shipped from this repo — the getflash.io landing redirect is
// an activation dependency for the invite feature.

const PENDING_INVITE_KEY = "pendingInviteToken"

// Matches the backend's INVITE_EXPIRY_HOURS (24h): a stored token older than
// this is expired server-side anyway, so discard instead of redeeming. Also
// bounds how long an un-redeemed token can linger on a shared device.
const PENDING_INVITE_MAX_AGE_MS = 24 * 60 * 60 * 1000

type PendingInvite = { token: string; storedAt: number }

const storePendingInvite = async (token: string) => {
  const record: PendingInvite = { token, storedAt: Date.now() }
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(record))
}

// Returns the stored token, or null. Discards expired or malformed values.
const readPendingInvite = async (): Promise<string | null> => {
  const raw = await AsyncStorage.getItem(PENDING_INVITE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PendingInvite
    if (!parsed?.token) throw new Error("malformed pending invite")
    if (Date.now() - (parsed.storedAt || 0) > PENDING_INVITE_MAX_AGE_MS) {
      await AsyncStorage.removeItem(PENDING_INVITE_KEY)
      return null
    }
    return parsed.token
  } catch {
    // Unparsable value (or pre-JSON legacy format) — discard it.
    await AsyncStorage.removeItem(PENDING_INVITE_KEY)
    return null
  }
}

export const useInviteDeepLink = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>()
  const [fetchInvitePreview] = useInvitePreviewLazyQuery()
  const isAuthed = useIsAuthed()

  // getInitialURL keeps returning the launch URL for the whole process
  // lifetime; re-processing it on auth changes would resurrect an
  // already-redeemed token and fire spurious alerts. Handle it exactly once.
  const initialUrlHandled = useRef(false)

  useEffect(() => {
    if (!initialUrlHandled.current) {
      initialUrlHandled.current = true
      Linking.getInitialURL().then((url) => {
        if (url) {
          handleDeepLink(url)
        }
      })
    }

    // Handle URL events while the app is already open
    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url)
    })

    return () => {
      subscription.remove()
    }
  }, [isAuthed, navigation, fetchInvitePreview])

  const handleDeepLink = async (url: string) => {
    // Only handle invite URLs
    if (!url.includes("invite")) {
      return
    }

    // Extract the token generically — the backend owns token format
    // validation. Anchoring a length/charset here would silently drop or
    // truncate tokens if the backend format ever changes.
    const tokenMatch = url.match(/[?&]token=([^&#\s]+)/)
    if (!tokenMatch || !tokenMatch[1]) {
      return
    }

    // Malformed %-encoding must not throw out of this async handler; fall
    // back to the raw captured value — the backend validates tokens anyway.
    let token: string
    try {
      token = decodeURIComponent(tokenMatch[1])
    } catch {
      token = tokenMatch[1]
    }

    try {
      if (!isAuthed) {
        // Store for redemption after signup/login. Never store for an authed
        // session: the current account can't redeem it, and a lingering token
        // would be redeemed by whichever account logs in next on this device.
        await storePendingInvite(token)
      }

      // Fetch invite preview to get details
      const { data: previewData, error } = await fetchInvitePreview({
        variables: { token },
        fetchPolicy: "network-only", // Force fresh fetch, bypass cache
      })

      if (error) {
        if (error.networkError) {
          // Genuinely transient (offline, server unreachable) — keep any
          // stored token so post-signup redemption can still succeed.
          Alert.alert("Error", "Unable to fetch invitation details. Please try again.")
          return
        }
        // GraphQL error: the backend throws for malformed/unknown tokens
        // (only existing-but-expired/used invites come back as isValid:false),
        // so this token can never redeem — don't leave it stored for a doomed
        // redemption and a stray post-signup alert.
        await AsyncStorage.removeItem(PENDING_INVITE_KEY)
        Alert.alert(
          "Invalid Invitation",
          "This invitation link is invalid or has expired.",
          [{ text: "OK" }],
        )
        return
      }

      if (!previewData?.invitePreview?.isValid) {
        // Known-invalid token: don't leave it around for a doomed redemption.
        await AsyncStorage.removeItem(PENDING_INVITE_KEY)
        Alert.alert(
          "Invalid Invitation",
          "This invitation link is invalid or has expired.",
          [{ text: "OK" }],
        )
        return
      }

      const { method, inviterUsername } = previewData.invitePreview

      if (isAuthed) {
        // Existing user - show message but don't redeem
        Alert.alert(
          "Invitation for New Users",
          `This invitation from ${
            inviterUsername || "a friend"
          } is for new users only. Share it with friends who haven't joined yet!`,
          [{ text: "OK" }],
        )
      } else {
        // If not logged in, navigate to phone login flow (which handles both
        // login and registration). No params: the login/registration screens
        // don't consume invite context — redemption rides the stored token
        // (redeemPendingInvite) after signup completes.
        // Add a small delay to ensure navigation is ready
        setTimeout(() => {
          if (method === "EMAIL") {
            navigation.navigate("emailLoginInitiate")
          } else {
            // For SMS or WHATSAPP, go to phone login flow
            navigation.navigate("phoneFlow", { screen: "phoneLoginInitiate" })
          }
        }, 500)
      }
    } catch (error) {
      console.error("Error handling invite deep link:", error)
      Alert.alert("Error", "Unable to process invitation. Please try again.")
    }
  }
}

// Backend error messages that permanently invalidate a token — retrying can
// never succeed, so the stored token is cleared when seen. Source of truth in
// the flash repo: the GraphQL resolver
// (src/graphql/public/root/mutation/redeem-invite.ts). Substring-matching
// prose across repos is fragile — machine-readable error codes would be the
// durable fix; keep this list in sync when the resolver's errors change.
const TERMINAL_REDEEM_ERRORS = [
  "expired",
  "already been used",
  "invalid invitation token",
  "your own invitation",
  "for new users only",
  "a different phone number",
  // one-reward-per-invitee invariant (pre-check + duplicate-key race)
  "already redeemed an invitation",
  // revoked invites
  "no longer valid",
]

// Terminal errors that shouldn't nag the user with an alert — the invite is
// simply consumed/duplicate from their point of view.
const SILENT_REDEEM_ERRORS = ["already been used", "already redeemed an invitation"]

const isTerminalRedeemError = (message: string) => {
  const normalized = message.toLowerCase()
  return TERMINAL_REDEEM_ERRORS.some((s) => normalized.includes(s))
}

// Guards against concurrent redemption attempts (e.g. a Welcome-screen
// remount double-firing before the first attempt clears the token).
let redeemInFlight = false

// Helper function to check and redeem pending invite after login
export const redeemPendingInvite = async (
  redeemInviteMutation: RedeemInviteMutationFn,
  showAlert = true,
) => {
  if (redeemInFlight) {
    return { success: false, message: "Redemption already in progress" }
  }
  redeemInFlight = true
  try {
    const token = await readPendingInvite()

    if (!token) {
      return { success: false, message: "No pending invite" }
    }

    // Call the redeemInvite mutation
    const { data } = await redeemInviteMutation({
      variables: {
        input: { token },
      },
    })

    if (data?.redeemInvite?.success) {
      await AsyncStorage.removeItem(PENDING_INVITE_KEY)
      if (showAlert) {
        Alert.alert(
          "Welcome!",
          "You've successfully accepted the invitation and joined through a referral.",
          [{ text: "OK" }],
        )
      }
      return { success: true, message: "Invite redeemed successfully" }
    } else if (data?.redeemInvite?.errors?.[0]) {
      const errorMessage = data.redeemInvite.errors[0]
      // Clear the token only for terminal errors; a transient server failure
      // keeps it so a later attempt can still redeem.
      if (isTerminalRedeemError(errorMessage)) {
        await AsyncStorage.removeItem(PENDING_INVITE_KEY)
      }
      // Only show alert for non-duplicate errors
      const isSilent = SILENT_REDEEM_ERRORS.some((s) =>
        errorMessage.toLowerCase().includes(s),
      )
      if (showAlert && !isSilent) {
        Alert.alert("Notice", errorMessage)
      }
      return { success: false, message: errorMessage }
    }

    // Ambiguous response — keep the token for retry.
    return { success: false, message: "Unknown error" }
  } catch (error) {
    // Thrown/network errors are transient — keep the token for retry.
    console.error("Error redeeming pending invite:", error)
    return { success: false, message: "Error redeeming invite" }
  } finally {
    // Safe: the guard is set synchronously before any await, and this reset
    // doesn't depend on the variable's in-between value — a documented
    // require-atomic-updates false-positive pattern.
    // eslint-disable-next-line require-atomic-updates
    redeemInFlight = false
  }
}
