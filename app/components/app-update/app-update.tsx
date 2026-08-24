import { gql } from "@apollo/client"
import { useMobileUpdateQuery } from "@app/graphql/generated"

import * as React from "react"
import { AppState, Linking, Platform, Pressable, View } from "react-native"
import DeviceInfo from "react-native-device-info"

import { VersionComponent } from "@app/components/version"
import { APP_STORE_LINK, CONTACT_EMAIL_ADDRESS, PLAY_STORE_LINK } from "@app/config"
import { useI18nContext } from "@app/i18n/i18n-react"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import ReactNativeModal from "react-native-modal"
import { isIos } from "../../utils/helper"
import { toastShow } from "../../utils/toast"
import { isUpdateAvailableOrRequired } from "./app-update.logic"
import { GaloyPrimaryButton } from "../atomic/galoy-primary-button"
import { GaloySecondaryButton } from "../atomic/galoy-secondary-button"

gql`
  query mobileUpdate {
    mobileVersions {
      platform
      currentSupported
      minSupported
    }
  }
`

const useStyles = makeStyles(({ colors }) => ({
  bottom: {
    alignItems: "center",
    marginVertical: 16,
  },

  lightningText: {
    fontSize: 20,
    marginBottom: 12,
    textAlign: "center",
  },

  openFailedText: {
    color: colors.error,
    marginBottom: 12,
    textAlign: "center",
  },

  versionComponent: { flex: 1, justifyContent: "flex-end", marginVertical: 48 },
  main: { flex: 5, justifyContent: "center" },
  button: { marginVertical: 12 },
}))

const storeLink = () => (isIos ? APP_STORE_LINK : PLAY_STORE_LINK)

// Local on purpose. Email is the right channel for the hard-block gate: the
// message carries the build number the user cannot look up themselves, and
// mail keeps it in a durable medium support can quote back, so this composes
// mail directly instead of routing through the shared WhatsApp helper.
const openSupportEmail = (subject: string, body: string) =>
  Linking.openURL(
    `mailto:${CONTACT_EMAIL_ADDRESS}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`,
  )

// The served payload is keyed by *platform*, but we ship two iOS apps off this
// same JS and the same API: `com.lnflash` and `com.flashapp.alt`. Their build
// numbers come from independent App Store Connect records — fastlane resolves
// alt's from `latest_testflight_build_number(app_identifier: "com.flashapp.alt")`
// and the main lanes from the default record — so one `minSupported` for "ios"
// cannot be correct for both counters. Using the documented incident lever
// (raise minBuildNumber to push com.lnflash users off a bad build) would
// otherwise hard-block every alt user whose independent counter happens to sit
// below that floor, on a modal with no dismiss.
//
// So the gate governs only the bundle whose counter the number is sized for.
// Android ships a single applicationId (also com.lnflash), so this is a no-op
// there today and stays correct if an alt flavor is ever added. If the API ever
// serves a distinct key per bundle, select on that instead and delete this.
export const GATED_BUNDLE_ID = "com.lnflash"

// Resolves true when the store page opened, false when the link could not be
// handled. Callers decide how to surface the failure: the soft banner can afford
// a toast, the blocking gate cannot (toastShow is dropped when a modal is
// already up — documented FIXME in utils/toast) and shows the message inside the
// modal.
//
// Android tries the `market://` scheme first. Only an installed store app claims
// it (Play Store, and AppGallery for the listings it carries), whereas
// PLAY_STORE_LINK is an https URL that any browser handles — so going straight
// to the web link means the store-less device the failure text was written for
// never reaches the catch, and a hard-blocked user lands on a page they cannot
// install from with no hint that Contact Support is the way out. The https link
// stays as the fallback for devices that have a browser but no store app.
const openInStore = async (): Promise<boolean> => {
  try {
    if (!isIos) {
      try {
        await Linking.openURL(`market://details?id=${DeviceInfo.getBundleId()}`)
        return true
      } catch (err) {
        // Not fatal on its own — a de-Googled device may still have a browser.
        console.warn({ err }, "no store app handled market://, trying the web link")
      }
    }
    await Linking.openURL(storeLink())
    return true
  } catch (err) {
    console.error({ err }, `could not open the app store link (${storeLink()})`)
    return false
  }
}

// The version numbers are served per-request and this component tree can stay
// resident for days, so both the banner and the gate must re-check whenever the
// app returns to the foreground — otherwise a raised minBuildNumber (incident
// lever) or a bumped currentSupported (routine release) only reaches users who
// fully restart the app.
const useMobileUpdateWithForegroundRefetch = () => {
  const { data, refetch } = useMobileUpdateQuery({ fetchPolicy: "no-cache" })

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refetch().catch(() => {})
      }
    })
    return () => subscription.remove()
  }, [refetch])

  // After every hook, so the early return never changes the hook order.
  // See GATED_BUNDLE_ID: a served "ios" number addresses one App Store record,
  // and this binary may be the other app.
  if (DeviceInfo.getBundleId() !== GATED_BUNDLE_ID) {
    return { available: false, required: false }
  }

  const buildNumber = Number(DeviceInfo.getBuildNumber())

  return isUpdateAvailableOrRequired({
    buildNumber,
    mobileVersions: data?.mobileVersions,
    OS: Platform.OS,
  })
}

type AppUpdateStatus = {
  available: boolean
  required: boolean
}

const AppUpdateContext = React.createContext<AppUpdateStatus | undefined>(undefined)

// "Am I blocked?" is one fact with one source. The gate (blocking modal) and the
// banner (soft nudge) are two views of it, so the query subscription and the
// AppState listener live here once instead of once per consumer — otherwise the
// two can drift apart on a later edit.
export const AppUpdateProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { available, required } = useMobileUpdateWithForegroundRefetch()

  const status = React.useMemo(() => ({ available, required }), [available, required])

  return <AppUpdateContext.Provider value={status}>{children}</AppUpdateContext.Provider>
}

const useAppUpdateStatus = (): AppUpdateStatus => {
  const status = React.useContext(AppUpdateContext)

  if (!status) {
    throw new Error("useAppUpdateStatus must be used within an <AppUpdateProvider>")
  }

  return status
}

// Soft "update available" banner, mounted on the home screen. The blocking
// modal is owned by AppUpdateGate (mounted globally in app.tsx) so that
// deep-link cold starts which never render Home can't bypass the gate.
export const AppUpdate: React.FC = () => {
  const styles = useStyles()
  const { LL } = useI18nContext()

  const { available, required } = useAppUpdateStatus()

  const linkUpgrade = () =>
    openInStore().then((opened) => {
      if (!opened) {
        // Nothing is covering the screen here, so a toast is reachable — but it
        // has to be the banner's wording, not the gate's: `couldNotOpenStore`
        // sends the user to a Contact Support button that only exists inside the
        // blocking modal. `currentTranslation` is what makes the toast render in
        // the user's locale (utils/toast falls back to English without it).
        toastShow({
          message: (translations) => translations.AppUpdate.couldNotOpenStoreBanner(),
          currentTranslation: LL,
        })
      }
    })

  // required implies available (build < min <= current); the gate's modal
  // already covers the screen, so the banner only handles the soft case.
  if (available && !required) {
    return (
      <View style={styles.bottom}>
        <Pressable onPress={linkUpgrade}>
          <Text style={styles.lightningText}>{LL.HomeScreen.updateAvailable()}</Text>
        </Pressable>
      </View>
    )
  }

  return null
}

// Blocking "update mandatory" gate. Mounted once, alongside the navigation
// container, so it covers every route — including deep-link cold starts.
export const AppUpdateGate: React.FC = () => {
  const { required } = useAppUpdateStatus()

  // A hard-blocked user has exactly two ways out of this modal, and both are
  // buttons here. A toast would be swallowed behind the modal, so failures are
  // rendered inline instead of leaving the tap a silent no-op.
  const [openFailed, setOpenFailed] = React.useState(false)
  const [contactFailed, setContactFailed] = React.useState(false)

  const linkUpgrade = React.useCallback(
    () => openInStore().then((opened) => setOpenFailed(!opened)),
    [],
  )

  const contactSupport = React.useCallback(
    (subject: string, body: string) =>
      openSupportEmail(subject, body)
        .then(() => setContactFailed(false))
        .catch((err) => {
          console.error({ err }, "could not open the support email composer")
          setContactFailed(true)
        }),
    [],
  )

  return (
    <AppUpdateModal
      isVisible={required}
      linkUpgrade={linkUpgrade}
      contactSupport={contactSupport}
      openFailed={openFailed}
      contactFailed={contactFailed}
    />
  )
}

export const AppUpdateModal = ({
  linkUpgrade,
  isVisible,
  contactSupport,
  openFailed = false,
  contactFailed = false,
}: {
  linkUpgrade: () => void
  isVisible: boolean
  // Required, not optional: this is one of only two escapes from a modal with no
  // dismiss, no backdrop press and a swallowed back button. An omitted handler
  // would compile fine and ship a dead button under text that tells the user to
  // tap it.
  contactSupport: (subject: string, body: string) => void
  openFailed?: boolean
  contactFailed?: boolean
}) => {
  const {
    theme: { colors },
  } = useTheme()

  const { LL } = useI18nContext()

  const message = LL.AppUpdate.needToUpdateSupportMessage({
    os: isIos ? "iOS" : "Android",
    version: DeviceInfo.getReadableVersion(),
  })
  const styles = useStyles()

  return (
    <ReactNativeModal
      isVisible={isVisible}
      backdropColor={colors.white}
      backdropOpacity={0.92}
      /**
       * Render inline instead of through the native modal host. RCTModalHostView
       * is broken under Fabric/New Architecture on Android (see #545): it
       * wrongly measures the flex:1 content container, so the bottom-pinned
       * spacer below (versionComponent) pushes this content off-screen while the
       * full-screen backdrop keeps capturing touches. This modal has no dismiss,
       * no backdrop press and swallows the hardware back button, so a wrongly
       * measured host would strand every hard-blocked user on a blank screen.
       * coverScreen={false} takes react-native-modal's inline render
       * path and measures correctly — note this makes paint order follow sibling
       * order, which is why <AppUpdateGate /> is mounted last in app.tsx.
       */
      coverScreen={false}
    >
      <View style={styles.main}>
        <Text style={styles.lightningText}>{LL.AppUpdate.versionNotSupported()}</Text>
        <Text style={styles.lightningText}>{LL.AppUpdate.updateMandatory()}</Text>
        <GaloyPrimaryButton
          buttonStyle={styles.button}
          onPress={linkUpgrade}
          title={LL.AppUpdate.tapHereUpdate()}
        />
        {openFailed && (
          <Text style={styles.openFailedText}>{LL.AppUpdate.couldNotOpenStore()}</Text>
        )}
        <GaloySecondaryButton
          buttonStyle={styles.button}
          onPress={() => contactSupport(LL.AppUpdate.versionNotSupported(), message)}
          title={LL.AppUpdate.contactSupport()}
        />
        {contactFailed && (
          // Last resort: if even the mail composer will not open, the address
          // has to be readable off the screen — this modal has no dismiss.
          <Text style={styles.openFailedText}>
            {LL.AppUpdate.couldNotOpenSupport({ email: CONTACT_EMAIL_ADDRESS })}
          </Text>
        )}
      </View>
      <View style={styles.versionComponent}>
        <VersionComponent />
      </View>
    </ReactNativeModal>
  )
}
