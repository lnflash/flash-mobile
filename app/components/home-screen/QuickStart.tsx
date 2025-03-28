import React, { useRef, useState } from "react"
import { Dimensions, TouchableOpacity, View } from "react-native"
import { StackNavigationProp } from "@react-navigation/stack"
import Carousel from "react-native-reanimated-carousel"
import { useNavigation } from "@react-navigation/native"
import { makeStyles, Text } from "@rneui/themed"
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

const width = Dimensions.get("window").width

type Props = {
  item: {
    title: string
    description: string
    image: any
    onPress: () => void
  }
  index: number
}

function QuickStart() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()

  const ref = useRef(null)
  const [advanceModalVisible, setAdvanceModalVisible] = useState(false)
  const [upgradeAccountModalVisible, setUpgradeAccountModalVisible] = useState(false)

  const data = [
    {
      title: "Upgrade your account",
      description: "Backup your cash wallet and increase transaction limits.",
      image: Account,
      onPress: () => setUpgradeAccountModalVisible(true),
    },
    {
      title: "Change to your local currency",
      description: "Review our available currency list and select your currency",
      image: Dollar,
      onPress: () => navigation.navigate("currency"),
    },
    {
      title: "Get a Flashcard",
      description: "Find a Flashpoint and get a Flashcard to use in daily life",
      image: Flashcard,
      onPress: () => navigation.navigate("Map"),
    },
    {
      title: "Non-custodial wallets",
      description: "Learn more about non-custodial wallets",
      image: NonCustodialWallet,
      onPress: () => {},
    },
    {
      title: "Email address",
      description:
        "Add your email address to secure your account and login using email address",
      image: Account,
      onPress: () => navigation.navigate("emailRegistrationInitiate"),
    },
    {
      title: "Enable BTC wallet",
      description: "Easily transfer larger amounts in Bitcoin.",
      image: GoldWallet,
      onPress: () => setAdvanceModalVisible(!advanceModalVisible),
    },
    {
      title: "Backup your BTC wallet",
      description: "Backup and secure your Bitcoin wallet using recovery phrase",
      image: SecureWallet,
      onPress: () => navigation.navigate("BackupOptions"),
    },
  ]

  const renderItem = ({ item, index }: Props) => {
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

  return (
    <View>
      <Carousel
        ref={ref}
        width={width}
        height={width / 2}
        data={data}
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
