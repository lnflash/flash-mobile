import React, { useEffect, useRef, useState } from "react"
import { Dimensions, Linking, TouchableOpacity, View } from "react-native"
import { StackNavigationProp } from "@react-navigation/stack"
import Carousel from "react-native-reanimated-carousel"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import * as Keychain from "react-native-keychain"

// assets
import Account from "@app/assets/illustrations/account.svg"
import Dollar from "@app/assets/illustrations/dollar.svg"
import Flashcard from "@app/assets/icons/empty-flashcard.svg"
import NonCustodialWallet from "@app/assets/illustrations/non-custodial-wallet.svg"
import GoldWallet from "@app/assets/illustrations/gold-wallet.svg"
import SecureWallet from "@app/assets/illustrations/secure-wallet.svg"

// components
import { UpgradeAccountModal } from "../upgrade-account-modal"
import { AdvancedModeModal } from "../advanced-mode-modal"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { AccountLevel, useHomeAuthedQuery } from "@app/graphql/generated"

// utils
import { KEYCHAIN_MNEMONIC_KEY } from "@app/utils/breez-sdk-liquid"

const width = Dimensions.get("window").width

type RenderItemProps = {
  item: {
    type: string
    title: string
    description: string
    image: any
    onPress: () => void
  }
  index: number
}

const QuickStart = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { persistentState, updateState } = usePersistentStateContext()

  const ref = useRef(null)
  const [advanceModalVisible, setAdvanceModalVisible] = useState(false)
  const [upgradeAccountModalVisible, setUpgradeAccountModalVisible] = useState(false)
  const [hasRecoveryPhrase, setHasRecoveryPhrase] = useState(false)

  const { data, loading } = useHomeAuthedQuery()

  useEffect(() => {
    checkRecoveryPhrase()
  }, [])

  const checkRecoveryPhrase = async () => {
    const credentials = await Keychain.getInternetCredentials(KEYCHAIN_MNEMONIC_KEY)
    if (credentials) setHasRecoveryPhrase(true)
  }

  let carouselData = [
    {
      type: "upgrade",
      title: LL.HomeScreen.upgradeTitle(),
      description: LL.HomeScreen.upgradeDesc(),
      image: Account,
      onPress: () => setUpgradeAccountModalVisible(true),
    },
    {
      type: "currency",
      title: LL.HomeScreen.currencyTitle(),
      description: LL.HomeScreen.currencyDesc(),
      image: Dollar,
      onPress: () => navigation.navigate("currency"),
    },
    {
      type: "flashcard",
      title: LL.HomeScreen.flashcardTitle(),
      description: LL.HomeScreen.flashcardDesc(),
      image: Flashcard,
      onPress: () => navigation.navigate("Map"),
    },
    {
      type: "nonCustodialWallet",
      title: LL.HomeScreen.nonCustodialWalletTitle(),
      description: LL.HomeScreen.nonCustodialWalletDesc(),
      image: NonCustodialWallet,
      onPress: () => {
        onHide("nonCustodialWallet")
        Linking.openURL(
          "https://flash-docs-msp2z.ondigitalocean.app/en/guides/non-custodial-wallets",
        )
      },
    },
    {
      type: "email",
      title: LL.HomeScreen.emailTitle(),
      description: LL.HomeScreen.emailDesc(),
      image: Account,
      onPress: () => navigation.navigate("emailRegistrationInitiate"),
    },
    {
      type: "btcWallet",
      title: LL.HomeScreen.btcWalletTitle(),
      description: LL.HomeScreen.btcWalletDesc(),
      image: GoldWallet,
      onPress: () => setAdvanceModalVisible(!advanceModalVisible),
    },
    {
      type: "backup",
      title: LL.HomeScreen.backupTitle(),
      description: LL.HomeScreen.backupDesc(),
      image: SecureWallet,
      onPress: () => navigation.navigate("BackupOptions"),
    },
  ]

  if (
    data?.me?.defaultAccount.level !== AccountLevel.Zero ||
    persistentState?.closedQuickStartTypes?.includes("upgrade")
  ) {
    carouselData = carouselData.filter((el) => el.type !== "upgrade")
  }
  if (
    persistentState.currencyChanged ||
    persistentState?.closedQuickStartTypes?.includes("currency")
  ) {
    carouselData = carouselData.filter((el) => el.type !== "currency")
  }
  if (
    persistentState.flashcardAdded ||
    persistentState?.closedQuickStartTypes?.includes("flashcard")
  ) {
    carouselData = carouselData.filter((el) => el.type !== "flashcard")
  }
  if (persistentState?.closedQuickStartTypes?.includes("nonCustodialWallet")) {
    carouselData = carouselData.filter((el) => el.type !== "nonCustodialWallet")
  }
  if (
    data?.me?.defaultAccount.level === AccountLevel.Zero ||
    !!data?.me?.email?.address ||
    persistentState?.closedQuickStartTypes?.includes("email")
  ) {
    carouselData = carouselData.filter((el) => el.type !== "email")
  }
  if (
    persistentState.isAdvanceMode ||
    persistentState?.closedQuickStartTypes?.includes("btcWallet") ||
    hasRecoveryPhrase
  ) {
    carouselData = carouselData.filter((el) => el.type !== "btcWallet")
  }
  if (
    persistentState.backedUpBtcWallet ||
    !persistentState.isAdvanceMode ||
    persistentState?.closedQuickStartTypes?.includes("backup")
  ) {
    carouselData = carouselData.filter((el) => el.type !== "backup")
  }

  const onHide = (type: string) => {
    updateState((state: any) => {
      if (state)
        return {
          ...state,
          closedQuickStartTypes: state.closedQuickStartTypes
            ? [...state.closedQuickStartTypes, type]
            : [type],
        }
      return undefined
    })
  }

  const renderItem = ({ item, index }: RenderItemProps) => {
    const Image = item.image
    return (
      <TouchableOpacity onPress={item.onPress} key={index} style={styles.itemContainer}>
        <Image height={width / 3} width={width / 3} />
        <View style={styles.texts}>
          <Text type="h1" bold style={styles.title}>
            {item.title}
          </Text>
          <Text type="bl">{item.description}</Text>
        </View>
        <TouchableOpacity style={styles.close} onPress={() => onHide(item.type)}>
          <Icon name={"close"} type="ionicon" color={colors.black} size={35} />
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  if (carouselData.length > 0) {
    return (
      <View>
        <Carousel
          ref={ref}
          width={width}
          height={width / 2.5}
          data={carouselData}
          renderItem={renderItem}
          mode="parallax"
          loop={carouselData.length !== 1}
          containerStyle={{ marginTop: 10 }}
        />
        <UpgradeAccountModal
          isVisible={upgradeAccountModalVisible}
          closeModal={() => setUpgradeAccountModalVisible(false)}
        />
        <AdvancedModeModal
          hasRecoveryPhrase={hasRecoveryPhrase}
          isVisible={advanceModalVisible}
          setIsVisible={setAdvanceModalVisible}
        />
      </View>
    )
  } else {
    return <View style={{ height: 20 }} />
  }
}

const useStyles = makeStyles(({ colors }) => ({
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    borderColor: colors.black,
    padding: 10,
  },
  texts: {
    flex: 1,
  },
  title: {
    marginBottom: 2,
    width: "85%",
  },
  close: {
    position: "absolute",
    top: 0,
    right: 0,
    padding: 5,
  },
}))

export default QuickStart
