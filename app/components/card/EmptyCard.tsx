import React from "react"
import { Dimensions, View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { PrimaryBtn } from "../buttons"

// hooks
import { useFlashcard } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"

// assets
import EmptyFlashcard from "@app/assets/icons/empty-flashcard.svg"

const width = Dimensions.get("screen").width

const EmptyCard = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { readFlashcard } = useFlashcard()

  const findFlashpoint = () => navigation.navigate("Map")

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text type="h03" bold>
          {LL.CardScreen.noCardsTitle()}
        </Text>
        <Text type="h01">{LL.CardScreen.noCardsYet()}</Text>
        <EmptyFlashcard height={width / 1.2} width={width / 1.2} style={styles.card} />
      </View>
      <PrimaryBtn
        label="Read NFC card"
        onPress={() => readFlashcard(false)}
        btnStyle={{ marginBottom: 10 }}
      />
      <PrimaryBtn type="outline" label="Find a Flashpoint" onPress={findFlashpoint} />
    </View>
  )
}

export default EmptyCard

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  top: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    marginVertical: 20,
  },
}))
