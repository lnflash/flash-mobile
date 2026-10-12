import { useApolloClient } from "@apollo/client"
import { GaloyInput } from "@app/components/atomic/galoy-input"
import { GALOY_INSTANCES, possibleGaloyInstanceNames } from "@app/config"
import { activateBeta } from "@app/graphql/client-only-query"
import { useBetaQuery, useLevelQuery } from "@app/graphql/generated"
import { useAppConfig } from "@app/hooks/use-app-config"
import { i18nObject } from "@app/i18n/i18n-util"
import { toastShow } from "@app/utils/toast"
import { getCardBridge, setCardBridge } from "@app/utils/cashu-card-bridge"
import { useTapFlashcard } from "@app/hooks/use-tap-flashcard"
import Clipboard from "@react-native-clipboard/clipboard"
import { getCrashlytics } from "@react-native-firebase/crashlytics"
import { Button, Text, makeStyles } from "@rneui/themed"
import * as React from "react"
import { Alert, DevSettings, View } from "react-native"
import { Screen } from "../../components/screen"
import { usePriceConversion } from "../../hooks"
import useLogout from "../../hooks/use-logout"
import { addDeviceToken } from "../../utils/notifications"
import { testProps } from "../../utils/testProps"

const usingHermes = typeof HermesInternal === "object" && HermesInternal !== null

/** The card fixtures `scripts/e2e/card-fixtures.ts serve` provisions on cardsim. */
const CARD_FIXTURES = ["fresh", "loaded", "spent", "full", "blocked"] as const

/**
 * Development builds only (ENG-634): point the card flows at cardsim and a
 * local mint, load a card fixture, and tap. The same controls the e2e flows
 * reach by deep link (`flash://dev/card-bridge`, `flash://dev/card-tap`).
 */
const CardBridgeControls: React.FC = () => {
  const styles = useStyles()
  const tapFlashcard = useTapFlashcard()
  const [bridgeUrl, setBridgeUrl] = React.useState("http://localhost:9876")
  const [mintUrl, setMintUrl] = React.useState("http://localhost:3338")
  const [fixturesUrl, setFixturesUrl] = React.useState("http://localhost:9877")
  const [config, setConfig] = React.useState(getCardBridge())

  const applyBridge = () => {
    try {
      setCardBridge({ url: bridgeUrl, mintUrl, stubPay: true })
      setConfig(getCardBridge())
    } catch (err) {
      Alert.alert(err instanceof Error ? err.message : String(err))
    }
  }

  const loadFixture = async (name: (typeof CARD_FIXTURES)[number]) => {
    try {
      const response = await fetch(`${fixturesUrl.replace(/\/+$/, "")}/load/${name}`, {
        method: "POST",
      })
      toastShow({
        message: `Fixture ${name}: ${response.ok ? "loaded" : response.status}`,
        type: response.ok ? "success" : "error",
      })
    } catch (err) {
      toastShow({ message: `Fixture ${name}: ${String(err)}`, type: "error" })
    }
  }

  return (
    <View>
      <Text style={styles.textHeader}>Card bridge (cardsim)</Text>
      <Text selectable {...testProps("Card bridge state")}>
        Card bridge: {config ? `${config.url} mint ${config.mintUrl}` : "off (NFC)"}
      </Text>
      <GaloyInput
        {...testProps("Card bridge URL")}
        label="Card bridge URL"
        autoCapitalize="none"
        autoCorrect={false}
        value={bridgeUrl}
        onChangeText={setBridgeUrl}
      />
      <GaloyInput
        {...testProps("Card mint URL")}
        label="Card mint URL"
        autoCapitalize="none"
        autoCorrect={false}
        value={mintUrl}
        onChangeText={setMintUrl}
      />
      <GaloyInput
        {...testProps("Card fixtures URL")}
        label="Card fixtures URL"
        autoCapitalize="none"
        autoCorrect={false}
        value={fixturesUrl}
        onChangeText={setFixturesUrl}
      />
      <Button
        title="Use card bridge"
        containerStyle={styles.button}
        onPress={applyBridge}
        {...testProps("Use card bridge")}
      />
      <Button
        title="Clear card bridge"
        containerStyle={styles.button}
        onPress={() => {
          setCardBridge(undefined)
          setConfig(getCardBridge())
        }}
        {...testProps("Clear card bridge")}
      />
      <Button
        title="Tap card"
        containerStyle={styles.button}
        onPress={() => tapFlashcard()}
        {...testProps("Tap card")}
      />
      {CARD_FIXTURES.map((name) => (
        <Button
          key={name}
          title={`Fixture: ${name}`}
          containerStyle={styles.button}
          onPress={() => loadFixture(name)}
          {...testProps(`Fixture ${name}`)}
        />
      ))}
    </View>
  )
}

export const DeveloperScreen: React.FC = () => {
  const styles = useStyles()
  const client = useApolloClient()
  const { usdPerSat } = usePriceConversion()
  const { logout } = useLogout()

  const { appConfig, saveToken, saveTokenAndInstance } = useAppConfig()
  const token = appConfig.token

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

  // Picking another instance empties the token field and picking the current
  // one restores the stored token. Keyed on the instance id, not the instance
  // object: a re-render that hands over a new object for the same instance
  // must not wipe a token that is being typed.
  const currentGaloyInstanceId = currentGaloyInstance.id
  React.useEffect(() => {
    if (newGaloyInstance === currentGaloyInstanceId) {
      setNewToken(token)
    } else {
      setNewToken("")
    }
  }, [newGaloyInstance, currentGaloyInstanceId, token])

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
          relayUrl: "wss://relay.test.flashapp.me", // TODO make configurable
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
            <CardBridgeControls />
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
}))
