import React from "react"
import { ScrollView, TouchableOpacity, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"

// components
import { IconBtn } from "../buttons"
import RecentActivity from "./RecentActivity"
import { Loading } from "@app/contexts/ActivityIndicatorContext"

// hooks
import { useDisplayCurrency, useFlashcard, usePriceConversion } from "@app/hooks"

// assets
import FlashcardImage from "@app/assets/images/flashcard.svg"
import Sync from "@app/assets/icons/sync.svg"

// utils
import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"

type Props = {
  onReload: () => void
  onTopup: () => void
}

const Flashcard: React.FC<Props> = ({ onReload, onTopup }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { balanceInSats, transactions, readFlashcard, resetFlashcard } = useFlashcard()
  const { formatMoneyAmount } = useDisplayCurrency()
  const { convertMoneyAmount } = usePriceConversion("network-only")

  if (!convertMoneyAmount) {
    return <Loading />
  }

  const convertedBalance = convertMoneyAmount(
    toBtcMoneyAmount(balanceInSats),
    DisplayCurrency,
  )

  const formattedBalance = formatMoneyAmount({
    moneyAmount: convertedBalance,
    noSymbol: false,
  })

  return (
    <ScrollView>
      <FlashcardImage style={styles.flashcard} width={"100%"} />
      <View style={styles.top} />
      <View style={styles.balanceWrapper}>
        <Text type="h03">{formattedBalance}</Text>
        <TouchableOpacity style={styles.sync} onPress={() => readFlashcard(false)}>
          <Sync color={colors.icon02} width={32} height={32} />
        </TouchableOpacity>
      </View>
      <View style={styles.btns}>
        <IconBtn type="clear" icon="down" label={`Reload\nCard`} onPress={onReload} />
        <IconBtn type="clear" icon="qr" label={`Topup via\nQR`} onPress={onTopup} />
        <IconBtn
          type="clear"
          icon={"cardRemove"}
          label={`Remove\nCard`}
          onPress={resetFlashcard}
        />
      </View>
      <View style={styles.caption}>
        <Text type="bl" bold>
          Do not throw away your card!
        </Text>
        <Text type="caption">If your card is lost, the funds are not recoverable</Text>
      </View>
      <RecentActivity
        transactions={transactions}
        convertMoneyAmount={convertMoneyAmount}
      />
    </ScrollView>
  )
}

export default Flashcard

const useStyles = makeStyles(({ colors }) => ({
  top: {
    paddingTop: 210,
  },
  flashcard: {
    position: "absolute",
    top: 10,
  },
  balanceWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
    marginLeft: 30,
  },
  sync: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  btns: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  caption: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border01,
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 15,
    backgroundColor: colors.layer,
  },
}))
