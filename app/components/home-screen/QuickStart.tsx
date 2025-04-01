import React, { useRef, useState } from "react"
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  TouchableOpacity,
  View,
} from "react-native"
import { StackNavigationProp } from "@react-navigation/stack"
import Carousel from "react-native-reanimated-carousel"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// assets
import Account from "@app/assets/illustrations/account.svg"
import Dollar from "@app/assets/illustrations/dollar.svg"
import Flashcard from "@app/assets/icons/empty-flashcard.svg"
import NonCustodialWallet from "@app/assets/illustrations/non-custodial-wallet.svg"
import GoldWallet from "@app/assets/illustrations/gold-wallet.svg"
import SecureWallet from "@app/assets/illustrations/secure-wallet.svg"

// components
import { UpgradeAccountModal } from "../upgrade-account-modal"
import { QuickStartAdvancedMode } from "../advanced-mode-modal"

// hooks
import { useFlashcard } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { AccountLevel, useHomeAuthedQuery } from "@app/graphql/generated"

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
  const { lnurl } = useFlashcard()
  const { persistentState } = usePersistentStateContext()

  const ref = useRef(null)
  const [advanceModalVisible, setAdvanceModalVisible] = useState(false)
  const [upgradeAccountModalVisible, setUpgradeAccountModalVisible] = useState(false)

  const { data, loading } = useHomeAuthedQuery()

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
      onPress: () => Linking.openURL("https://docs.getflash.io/non-custodial-wallets"),
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

  if (data?.me?.defaultAccount.level !== AccountLevel.Zero) {
    carouselData = carouselData.filter((el) => el.type !== "upgrade")
  }
  if (persistentState.currencyChanged) {
    carouselData = carouselData.filter((el) => el.type !== "currency")
  }
  if (!!lnurl) {
    carouselData = carouselData.filter((el) => el.type !== "flashcard")
  }
  if (
    data?.me?.defaultAccount.level === AccountLevel.Zero ||
    !!data?.me?.email?.address
  ) {
    carouselData = carouselData.filter((el) => el.type !== "email")
  }
  if (persistentState.isAdvanceMode) {
    carouselData = carouselData.filter((el) => el.type !== "btcWallet")
  }
  if (persistentState.backupBtcWallet || !persistentState.isAdvanceMode) {
    carouselData = carouselData.filter((el) => el.type !== "backup")
  }

  const renderItem = ({ item, index }: RenderItemProps) => {
    const Image = item.image
    return (
      <TouchableOpacity onPress={item.onPress} key={index} style={styles.itemContainer}>
        <Image height={width / 3} width={width / 3} />
        <View style={styles.texts}>
          <Text type="h1" bold style={{ marginBottom: 5 }}>
            {item.title}
          </Text>
          <Text type="bl">{item.description}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
    )
  }

  return (
    <View>
      <Carousel
        ref={ref}
        width={width}
        height={width / 2}
        data={carouselData}
        renderItem={renderItem}
        mode="parallax"
      />

      <UpgradeAccountModal
        isVisible={upgradeAccountModalVisible}
        closeModal={() => setUpgradeAccountModalVisible(false)}
      />
      <QuickStartAdvancedMode
        advanceModalVisible={advanceModalVisible}
        setAdvanceModalVisible={setAdvanceModalVisible}
      />
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    padding: 10,
  },
  texts: {
    flex: 1,
  },
  dotContainer: {
    gap: 5,
  },
  dotStyle: {
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 50,
  },
}))

export default QuickStart
