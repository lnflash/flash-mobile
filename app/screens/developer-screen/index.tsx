import { useApolloClient } from "@apollo/client"
import { GaloyInput } from "@app/components/atomic/galoy-input"
import { GALOY_INSTANCES, possibleGaloyInstanceNames } from "@app/config"
import { activateBeta } from "@app/graphql/client-only-query"
import { useBetaQuery, useLevelQuery } from "@app/graphql/generated"
import { useAppConfig } from "@app/hooks/use-app-config"
import { i18nObject } from "@app/i18n/i18n-util"
import { toastShow } from "@app/utils/toast"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { Switch } from "@rneui/base"
import Clipboard from "@react-native-clipboard/clipboard"
import { getCrashlytics } from "@react-native-firebase/crashlytics"
import { Button, Text, makeStyles } from "@rneui/themed"
import * as React from "react"
import { Alert, DevSettings, View, ActivityIndicator } from "react-native"
import { Screen } from "../../components/screen"
import { usePriceConversion } from "../../hooks"
import useLogout from "../../hooks/use-logout"
import { addDeviceToken } from "../../utils/notifications"
import { testProps } from "../../utils/testProps"
import Config from "react-native-config"
import { getPublicKey } from "nostr-tools"
import { getSecretKey } from "@app/utils/nostr"
import useNostrProfile from "@app/hooks/use-nostr-profile"
import {
  generateRoboHashAvatar,
  generateGradientBanner,
} from "@app/utils/nostr/image-generation"
import { uploadToNostrBuild } from "@app/utils/nostr/media-upload"
import { useChatContext } from "@app/screens/chat/chatContext"

const usingHermes = typeof HermesInternal === "object" && HermesInternal !== null

export const DeveloperScreen: React.FC = () => {
  const styles = useStyles()
  const client = useApolloClient()
  const { usdPerSat } = usePriceConversion()
  const { logout } = useLogout()

  const { appConfig, saveToken, saveTokenAndInstance } = useAppConfig()
  const token = appConfig.token
  const { persistentState, updateState } = usePersistentStateContext()
  const { updateNostrProfile } = useNostrProfile()
  const { userProfileEvent } = useChatContext()

  const [generatingImages, setGeneratingImages] = React.useState(false)

  const { data: dataLevel } = useLevelQuery({ fetchPolicy: "cache-only" })
  const level = String(dataLevel?.me?.defaultAccount?.level)

  const [newToken, setNewToken] = React.useState(token)
  const currentGaloyInstance = appConfig.galoyInstance

  const [newGraphqlUri, setNewGraphqlUri] = React.useState(
    currentGaloyInstance.id === "Custom" ? currentGaloyInstance.graphqlUri : "",
  )
  const [newGraphqlWslUri, setNewGraphqlWslUri] = React.useState(
    currentGaloyInstance.id === "Custom" ? currentGaloyInstance.graphqlWsUri : "",
  )
  const [newPosUrl, setNewPosUrl] = React.useState(
    currentGaloyInstance.id === "Custom" ? currentGaloyInstance.posUrl : "",
  )

  const [newRestUrl, setNewRestUrl] = React.useState(
    currentGaloyInstance.id === "Custom" ? currentGaloyInstance.authUrl : "",
  )

  const [newLnAddressHostname, setNewLnAddressHostname] = React.useState(
    currentGaloyInstance.id === "Custom" ? currentGaloyInstance.lnAddressHostname : "",
  )

  const [newGaloyInstance, setNewGaloyInstance] = React.useState(currentGaloyInstance.id)

  const dataBeta = useBetaQuery()
  const beta = dataBeta.data?.beta ?? false

  const changesHaveBeenMade =
    newToken !== token ||
    (newGaloyInstance !== currentGaloyInstance.id && newGaloyInstance !== "Custom") ||
    (newGaloyInstance === "Custom" &&
      Boolean(newGraphqlUri) &&
      Boolean(newGraphqlWslUri) &&
      Boolean(newPosUrl) &&
      Boolean(newRestUrl) &&
      (newGraphqlUri !== currentGaloyInstance.graphqlUri ||
        newGraphqlWslUri !== currentGaloyInstance.graphqlWsUri ||
        newPosUrl !== currentGaloyInstance.posUrl ||
        newRestUrl !== currentGaloyInstance.authUrl ||
        newLnAddressHostname !== currentGaloyInstance.lnAddressHostname))

  React.useEffect(() => {
    if (newGaloyInstance === currentGaloyInstance.id) {
      setNewToken(token)
    } else {
      setNewToken("")
    }
  }, [newGaloyInstance, currentGaloyInstance, token])

  const handleSave = async () => {
    await logout(false)

    if (newGaloyInstance === "Custom") {
      saveTokenAndInstance({
        instance: {
          id: "Custom",
          graphqlUri: newGraphqlUri,
          graphqlWsUri: newGraphqlWslUri,
          authUrl: newRestUrl,
          posUrl: newPosUrl,
          lnAddressHostname: newLnAddressHostname,
          name: "Custom", // TODO: make configurable
          blockExplorer: "https://mempool.space/tx/", // TODO make configurable
        },
        token: newToken || "",
      })
    }

    const newGaloyInstanceObject = GALOY_INSTANCES.find(
      (instance) => instance.id === newGaloyInstance,
    )

    if (newGaloyInstanceObject) {
      saveTokenAndInstance({ instance: newGaloyInstanceObject, token: newToken || "" })
      return
    }

    saveToken(newToken || "")
  }

  const handleGenerateProfileImages = async () => {
    try {
      setGeneratingImages(true)

      // Get user's Nostr key
      const secretKey = await getSecretKey()
      if (!secretKey) {
        Alert.alert("Error", "No Nostr profile found. Please create a Nostr profile first.")
        return
      }

      const pubkey = getPublicKey(secretKey)
      console.log("Generating images for pubkey:", pubkey)

      // Check FLASH_NOSTR_NSEC is configured
      const flashNsec = Config.FLASH_NOSTR_NSEC
      if (!flashNsec || flashNsec === "ADD_YOUR_NSEC_HERE") {
        Alert.alert(
          "Configuration Error",
          "FLASH_NOSTR_NSEC not configured in .env file. Cannot upload images.",
        )
        return
      }

      Alert.alert(
        "Generating Images",
        "This will generate a random profile picture and banner, upload them to nostr.build, and update your profile. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Generate",
            onPress: async () => {
              try {
                // Generate images
                console.log("Step 1: Generating RoboHash avatar...")
                const avatarUri = await generateRoboHashAvatar(pubkey)
                console.log("Avatar generated:", avatarUri)

                console.log("Step 2: Generating gradient banner...")
                const bannerUri = await generateGradientBanner(pubkey)
                console.log("Banner generated:", bannerUri)

                // Upload to nostr.build
                console.log("Step 3: Uploading avatar to nostr.build...")
                const pictureUrl = await uploadToNostrBuild(avatarUri, flashNsec, false)
                console.log("Avatar uploaded:", pictureUrl)

                console.log("Step 4: Uploading banner to nostr.build...")
                const bannerUrl = await uploadToNostrBuild(bannerUri, flashNsec, false)
                console.log("Banner uploaded:", bannerUrl)

                // Update kind-0 event
                console.log("Step 5: Updating Nostr profile...")

                // Parse existing profile data to preserve all fields
                let existingProfile = {}
                if (userProfileEvent?.content) {
                  try {
                    existingProfile = JSON.parse(userProfileEvent.content)
                    console.log("Existing profile data:", existingProfile)
                  } catch (e) {
                    console.log("No existing profile found, creating new one")
                  }
                }

                // Merge with new images
                const updatedProfile = {
                  ...existingProfile,
                  picture: pictureUrl,
                  banner: bannerUrl,
                }

                console.log("Updated profile data:", updatedProfile)

                await updateNostrProfile({
                  content: updatedProfile,
                })

                Alert.alert(
                  "Success!",
                  `Profile picture and banner generated and uploaded!\n\nAvatar: ${pictureUrl}\nBanner: ${bannerUrl}`,
                )
              } catch (error) {
                console.error("Error in image generation flow:", error)
                const message = error instanceof Error ? error.message : "Failed to generate images"
                Alert.alert("Error", message)
              } finally {
                setGeneratingImages(false)
              }
            },
          },
        ],
      )
    } catch (error) {
      console.error("Error generating images:", error)
      const message = error instanceof Error ? error.message : "Failed to generate images"
      Alert.alert("Error", message)
      setGeneratingImages(false)
    }
  }

  return (
    <Screen preset="scroll">
      <View style={styles.screenContainer}>
        <Button
          title="Log out"
          containerStyle={styles.button}
          onPress={async () => {
            await logout()
            Alert.alert("state successfully deleted. Restart your app")
          }}
          {...testProps("logout button")}
        />
        <Button
          title="Send device token"
          containerStyle={styles.button}
          onPress={async () => {
            if (token && client) {
              addDeviceToken(client)
            }
          }}
        />
        <Button
          title={`Beta features: ${beta}`}
          containerStyle={styles.button}
          onPress={async () => activateBeta(client, !beta)}
        />
        {__DEV__ && (
          <>
            <View style={styles.switchContainer}>
              <Text style={styles.switchLabel}>
                Bypass Pubkey Age Check (3-day requirement)
              </Text>
              <Switch
                value={!!persistentState.bypassPubkeyAgeCheck}
                onValueChange={(enabled) => {
                  updateState((state: any) => {
                    if (state) {
                      return {
                        ...state,
                        bypassPubkeyAgeCheck: enabled,
                      }
                    }
                    return undefined
                  })
                  Alert.alert(
                    "Setting Updated",
                    enabled
                      ? "Pubkey age check bypassed. You can now post immediately."
                      : "Pubkey age check re-enabled. 3-day requirement is now active.",
                  )
                }}
              />
            </View>
            <Button
              title="Reload"
              containerStyle={styles.button}
              onPress={() => DevSettings.reload()}
            />
            <Button
              title="Crash test"
              containerStyle={styles.button}
              onPress={() => {
                getCrashlytics().log("Testing crash")
                getCrashlytics().crash()
              }}
            />
            <Button
              title="Error toast with translation"
              containerStyle={styles.button}
              {...testProps("Error Toast")}
              onPress={() => {
                toastShow({
                  message: (translations) => translations.errors.generic(),
                  currentTranslation: i18nObject("es"),
                })
              }}
            />
            <Button
              title={
                generatingImages
                  ? "Generating..."
                  : "Generate Profile Pic & Banner"
              }
              containerStyle={styles.button}
              onPress={handleGenerateProfileImages}
              disabled={generatingImages}
            />
            {generatingImages && (
              <ActivityIndicator
                size="small"
                color="#007AFF"
                style={{ marginVertical: 8 }}
              />
            )}
          </>
        )}
        <View>
          <Text style={styles.textHeader}>Environment Information</Text>
          <Text selectable>Galoy Instance: {appConfig.galoyInstance.id}</Text>
          <Text selectable>GQL_URL: {appConfig.galoyInstance.graphqlUri}</Text>
          <Text selectable>GQL_WS_URL: {appConfig.galoyInstance.graphqlWsUri}</Text>
          <Text selectable>POS URL: {appConfig.galoyInstance.posUrl}</Text>
          <Text selectable>
            LN Address Hostname: {appConfig.galoyInstance.lnAddressHostname}
          </Text>
          <Text selectable>
            USD per 1 sat: {usdPerSat ? `$${usdPerSat}` : "No price data"}
          </Text>
          <Text>Token Present: {String(Boolean(token))}</Text>
          <Text>Level: {level}</Text>
          <Text>Hermes: {String(Boolean(usingHermes))}</Text>
          <Button
            {...testProps("Save Changes")}
            title="Save changes"
            style={styles.button}
            onPress={handleSave}
            disabled={!changesHaveBeenMade}
          />
          <Text style={styles.textHeader}>Update Environment</Text>
          {possibleGaloyInstanceNames.map((instanceName) => (
            <Button
              key={instanceName}
              title={instanceName}
              onPress={() => {
                setNewGaloyInstance(instanceName)
              }}
              {...testProps(`${instanceName} button`)}
              buttonStyle={
                instanceName === newGaloyInstance
                  ? styles.selectedInstanceButton
                  : styles.notSelectedInstanceButton
              }
              titleStyle={
                instanceName === newGaloyInstance
                  ? styles.selectedInstanceButton
                  : styles.notSelectedInstanceButton
              }
              containerStyle={
                instanceName === newGaloyInstance
                  ? styles.selectedInstanceButton
                  : styles.notSelectedInstanceButton
              }
              {...testProps(`${instanceName} Button`)}
            />
          ))}
          <GaloyInput
            {...testProps("Input access token")}
            label="Access Token"
            placeholder={"Access token"}
            value={newToken}
            secureTextEntry={true}
            onChangeText={setNewToken}
            selectTextOnFocus
          />
          <Button
            {...testProps("Copy access token")}
            title="Copy access token"
            containerStyle={styles.button}
            onPress={async () => {
              Clipboard.setString(newToken || "")
              Alert.alert("Token copied in clipboard.")
            }}
            disabled={!newToken}
          />
          {newGaloyInstance === "Custom" && (
            <>
              <GaloyInput
                label="Graphql Uri"
                placeholder={"Graphql Uri"}
                autoCapitalize="none"
                autoCorrect={false}
                value={newGraphqlUri}
                onChangeText={setNewGraphqlUri}
                selectTextOnFocus
              />
              <GaloyInput
                label="Graphql Ws Uri"
                placeholder={"Graphql Ws Uri"}
                autoCapitalize="none"
                autoCorrect={false}
                value={newGraphqlWslUri}
                onChangeText={setNewGraphqlWslUri}
                selectTextOnFocus
              />
              <GaloyInput
                label="POS Url"
                placeholder={"POS Url"}
                autoCapitalize="none"
                autoCorrect={false}
                value={newPosUrl}
                onChangeText={setNewPosUrl}
                selectTextOnFocus
              />
              <GaloyInput
                label="Rest Url"
                placeholder={"Rest Url"}
                autoCapitalize="none"
                autoCorrect={false}
                value={newRestUrl}
                onChangeText={setNewRestUrl}
                selectTextOnFocus
              />
              <GaloyInput
                label="LN Address Hostname"
                placeholder={"LN Address Hostname"}
                autoCapitalize="none"
                autoCorrect={false}
                value={newLnAddressHostname}
                onChangeText={setNewLnAddressHostname}
                selectTextOnFocus
              />
            </>
          )}
        </View>
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  button: {
    marginVertical: 6,
  },
  screenContainer: {
    marginHorizontal: 12,
    marginBottom: 40,
  },
  textHeader: {
    fontSize: 18,
    marginVertical: 12,
  },
  selectedInstanceButton: {
    backgroundColor: colors.grey5,
    color: colors.white,
  },
  notSelectedInstanceButton: {
    backgroundColor: colors.white,
    color: colors.grey3,
  },
  switchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.grey5,
    borderRadius: 8,
  },
  switchLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.black,
    marginRight: 8,
  },
}))
