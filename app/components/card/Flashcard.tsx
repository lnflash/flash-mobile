import React from "react"
import { Image, ScrollView, TouchableOpacity, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"

// components
import { IconBtn } from "../buttons"
import RecentActivity from "./RecentActivity"
import { Loading } from "@app/contexts/ActivityIndicatorContext"
import HideableArea from "../hideable-area/hideable-area"

// hooks
import {
  useDisplayCurrency,
  useFlashcard,
  usePriceConversion,
  useUnauthedPriceConversion,
} from "@app/hooks"
import { useHideBalanceQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"

// assets
import FlashcardImage from "@app/assets/images/flashcard.png"
import Sync from "@app/assets/icons/sync.svg"

// utils
import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"

type Props = {
  onReload: () => void
  onTopup: () => void
}

const Flashcard: React.FC<Props> = ({ onReload, onTopup }) => {
  const isAuthed = useIsAuthed()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { balanceInSats, transactions, readFlashcard, resetFlashcard } = useFlashcard()
  const { formatMoneyAmount } = useDisplayCurrency()
  const { convertMoneyAmount } = isAuthed
    ? usePriceConversion()
    : useUnauthedPriceConversion()

  const { data: { hideBalance = false } = {} } = useHideBalanceQuery()

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
      <Image source={FlashcardImage} style={styles.flashcard} />
      <View style={styles.top} />
      <View style={styles.balanceWrapper}>
        <HideableArea isContentVisible={hideBalance}>
          <Text type="h03">{formattedBalance}</Text>
          <TouchableOpacity style={styles.sync} onPress={() => readFlashcard(false)}>
            <Sync color={colors.icon02} width={32} height={32} />
          </TouchableOpacity>
        </HideableArea>
      </View>
      {isAuthed && (
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
      )}
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
    alignSelf: "center",
    top: 10,
  },
  balanceWrapper: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
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
