import { Button, makeStyles, Text, useTheme } from "@rneui/themed"
import * as React from "react"
import { useState } from "react"
import { ActivityIndicator, View, Pressable, Image, Alert } from "react-native"
import { FlatList } from "react-native-gesture-handler"
import Icon from "react-native-vector-icons/Ionicons"
import nfcManager from "react-native-nfc-manager"
import {
  useAccountDefaultWalletLazyQuery,
  useScanningQrCodeScreenQuery,
} from "@app/graphql/generated"
import crashlytics from "@react-native-firebase/crashlytics"

import { gql, useQuery } from "@apollo/client"
import { Screen } from "@app/components/screen"
import { GaloyIconButton } from "@app/components/atomic/galoy-icon-button"
import { testProps } from "../../utils/testProps"
import { ModalNfcFlashcard } from "@app/components/modal-nfc"
import CardImage from "@app/assets/images/flashcard-front.png"
import { icons } from "@app/components/atomic/galoy-icon"

import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RouteProp } from "@react-navigation/native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import {
  DestinationDirection,
  PaymentDestination,
} from "@app/screens/send-bitcoin-screen/payment-destination/index.types"
import { parseDestination } from "@app/screens/send-bitcoin-screen/payment-destination"

// Import the conversion functions
import { toUsdMoneyAmount } from "@app/types/amounts"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { StackNavigationProp } from "@react-navigation/stack"
import { LNURL_DOMAINS } from "@app/config"

type CardScreenNavigationProp = StackNavigationProp<RootStackParamList, "cardScreen">
type CardScreenRouteProp = RouteProp<RootStackParamList, "cardScreen">
type Props = {
  navigation: CardScreenNavigationProp
  route: CardScreenRouteProp
}

const multiple = (currentUnit: string) => {
  switch (currentUnit) {
    case "USDCENT":
      return 10 ** -5
    default:
      return 1
  }
}

const BTC_CURRENT_PRICE_QUERY = gql`
  query btcPriceList($range: PriceGraphRange!) {
    btcPriceList(range: $range) {
      timestamp
      price {
        base
        offset
        currencyUnit
      }
    }
  }
`

gql`
  query scanningQRCodeScreen {
    globals {
      network
    }
    me {
      id
      defaultAccount {
        id
        wallets {
          id
        }
      }
      contacts {
        id
        username
      }
    }
  }
`

export const CardScreen: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()

  // const navigation = useNavigation()
  const { data } = useScanningQrCodeScreenQuery({ skip: !useIsAuthed() })
  const wallets = data?.me?.defaultAccount.wallets
  const bitcoinNetwork = data?.globals?.network
  const [accountDefaultWalletQuery] = useAccountDefaultWalletLazyQuery({
    fetchPolicy: "no-cache",
  })

  const isAuthed = useIsAuthed()
  const { formatMoneyAmount } = useDisplayCurrency()

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [flashCards, setFlashCards] = useState<FlashCards[]>([])
  const [displayReceiveNfc, setDisplayReceiveNfc] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const { LL } = useI18nContext()

  const loading = false // placeholder for query loading if we need to load card data in the future
  const [cardHtml, setCardHtml] = useState<string | null>(null)
  const [refreshBalance, setRefreshBalance] = useState<string | null>("false")
  const [balance, setBalance] = useState<string>("$0.00")
  const [reloadLnurl, setReloadLnurl] = useState<PaymentDestination>()

  const {
    data: priceData,
    loading: priceLoading,
    error: priceError,
  } = useQuery(BTC_CURRENT_PRICE_QUERY, {
    fetchPolicy: "cache-only",
    variables: { range: "ONE_DAY" }, // Pass a valid range
  })

  const handleCardHtmlUpdate = (html: string) => {
    setCardHtml(html)
    if (priceData && !priceLoading && !priceError) {
      const currentPriceData =
        priceData.btcPriceList[priceData.btcPriceList.length - 1].price
      const usdPerSat =
        ((currentPriceData.base / 10 ** currentPriceData.offset) *
          multiple(currentPriceData.currencyUnit)) /
        1e5
      // Extract balance from the HTML
      const balanceMatch = html.match(/(\d{1,3}(?:,\d{3})*)\s*SATS<\/dt>/)
      if (balanceMatch) {
        const parsedBalance = balanceMatch[1].replace(/,/g, "") // Remove commas
        const satoshiAmount = parseInt(parsedBalance, 10)
        // Convert SATS to USD using the current BTC price
        const usdAmount = satoshiAmount * usdPerSat
        const formattedBalance = formatMoneyAmount({
          moneyAmount: toUsdMoneyAmount(usdAmount * 100),
        })
        setBalance(formattedBalance)
      } else {
        return
      }
      const lnurlMatch = html.match(/href="lightning:(lnurl\w+)"/)
      if (lnurlMatch) {
        parseAndSetDestination(lnurlMatch[1])
      }
    }
  }

  const parseAndSetDestination = async (lnurlMatch: string) => {
    if (!wallets || !bitcoinNetwork || !lnurlMatch) {
      return
    }
    try {
      const destination = await parseDestination({
        rawInput: lnurlMatch,
        myWalletIds: wallets.map((wallet) => wallet.id),
        bitcoinNetwork,
        lnurlDomains: LNURL_DOMAINS,
        accountDefaultWalletQuery,
      })
      if (destination.valid) {
        if (destination.destinationDirection === DestinationDirection.Send) {
          setReloadLnurl(destination)
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        crashlytics().recordError(err)
        Alert.alert(err.toString(), "", [
          {
            text: LL.common.ok(),
          },
        ])
      }
    }
  }

  const resetCardHtml = () => {
    setCardHtml(null)
  }

  let ListEmptyContent: React.ReactNode

  if (loading || !initialized) {
    ListEmptyContent = (
      <View style={styles.activityIndicatorContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  } else {
    ListEmptyContent = (
      <View style={styles.emptyListNoContacts}>
        <Text {...testProps(LL.CardScreen.noCardsTitle())} style={styles.emptyListTitle}>
          {LL.CardScreen.noCardsTitle()}
        </Text>
        <Text style={styles.emptyListText}>{LL.CardScreen.noCardsYet()}</Text>
        <View style={styles.emptyListScanIcon}>
          <Pressable onPress={() => setDisplayReceiveNfc(true)}>
            <Icon name="card" size={96} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    )
  }

  React.useEffect(() => {
    const initializeNfc = async () => {
      if (await nfcManager.isSupported()) {
        await nfcManager.start()
        if (!cardHtml) {
          setDisplayReceiveNfc(true)
        }
      }
    }

    const handleFocus = async () => {
      setInitialized(false)
      await initializeNfc()
      initialize()
    }

    const unsubscribeFocus = navigation.addListener("focus", handleFocus)

    async function initialize() {
      if (!isAuthed) {
        return
      }
      setInitialized(true)
    }

    // Initialize NFC on mount
    initializeNfc()

    return () => {
      unsubscribeFocus()
    }
  }, [navigation, isAuthed, cardHtml, refreshBalance, setDisplayReceiveNfc])

  const onMenuClick = (target: Target) => {
    if (isAuthed) {
      if (target === "sendBitcoinDetails" && reloadLnurl) {
        navigation.navigate("sendBitcoinDetails", {
          paymentDestination: reloadLnurl,
        })
      } else if (target === "cardScreen") {
        // Reload the card
        console.log("Reloading card")
        setRefreshBalance(null)
        setDisplayReceiveNfc(true)
      }
    } else {
      console.log("Reloading skipped")
    }
  }

  type Target = "cardScreen" | "sendBitcoinDetails"
  type IconNamesType = keyof typeof icons

  const buttons = [
    {
      title: LL.HomeScreen.balance(),
      target: "cardScreen" as Target,
      icon: "refresh" as IconNamesType,
    },
    {
      title: LL.HomeScreen.reload(),
      target: "sendBitcoinDetails" as Target,
      icon: "receive" as IconNamesType,
    },
  ]

  return (
    <Screen
      keyboardOffset="navigationHeader"
      keyboardShouldPersistTaps="handled"
      style={styles.screenStyle}
    >
      {cardHtml ? (
        <>
          <Text style={styles.flashcardBalanceText}>{balance}</Text>
          <Image source={CardImage} style={styles.flashcardImage} />
          <View style={styles.listItemsContainer}>
            {buttons.map((item) => (
              <View key={item.icon} style={styles.button}>
                <GaloyIconButton
                  name={item.icon}
                  size="large"
                  text={item.title}
                  onPress={() => onMenuClick(item.target)}
                />
              </View>
            ))}
          </View>
          <Button
            style={styles.removeButton}
            title="Remove Flashcard"
            onPress={resetCardHtml}
          />
        </>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContainer}
          data={flashCards}
          ListEmptyComponent={ListEmptyContent}
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          renderItem={({ item }) => {
            return (
              <View></View>
              // return empty view as placeholer for now
              // will be used for transaction history in the future
            )
          }}
          keyExtractor={(item) => item.uuid}
        />
      )}
      {(!cardHtml || !refreshBalance) && (
        <ModalNfcFlashcard
          isActive={displayReceiveNfc}
          setIsActive={setDisplayReceiveNfc}
          onCardHtmlUpdate={handleCardHtmlUpdate}
        />
      )}
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },

  activityIndicatorContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },

  emptyListNoContacts: {
    marginHorizontal: 12,
    marginTop: 32,
  },

  emptyListScanIcon: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingTop: 74,
  },

  emptyListText: {
    fontSize: 18,
    marginTop: 30,
    textAlign: "center",
    color: colors.black,
  },

  emptyListTitle: {
    color: colors.black,
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
  },

  listContainer: { flexGrow: 1 },

  flashcardImage: {
    width: "100%", // Adjust the size as needed
    height: 200, // Adjust the size as needed
    resizeMode: "contain",
    marginBottom: 16, // Add some space below the image
  },
  flashcardBalanceText: {
    fontSize: 36,
    marginBottom: 8,
    marginTop: 16,
    textAlign: "center",
  },
  listItemsContainer: {
    paddingHorizontal: 15,
    paddingVertical: 15,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: colors.grey5,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  button: {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 184,
  },
  removeButton: {
    marginTop: 16,
    display: "flex",
    paddingVertical: 96,
    borderRadius: 12,
  },
}))