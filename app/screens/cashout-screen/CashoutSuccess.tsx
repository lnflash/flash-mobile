import React from "react"
import { View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { StackScreenProps } from "@react-navigation/stack"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { GaloyIcon } from "@app/components/atomic/galoy-icon"
import { PrimaryBtn } from "@app/components/buttons"
import { Screen } from "@app/components/screen"
import {
  SuccessIconAnimation,
  SuccessTextAnimation,
} from "@app/components/success-animation"

type Props = StackScreenProps<RootStackParamList, "CashoutSuccess">

const CashoutSuccess: React.FC<Props> = ({ navigation, route }) => {
  const { receiveUsd, receiveJmd } = route.params
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const styles = useStyles()

  const onPressDone = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: "Primary" }],
    })
  }

  return (
    <Screen backgroundColor={colors.accent02}>
      <View style={styles.container}>
        <SuccessIconAnimation>
          <GaloyIcon name={"send-success"} size={128} />
        </SuccessIconAnimation>
        <SuccessTextAnimation>
          <Text type="h01" style={[styles.successText, { marginTop: 32 }]}>
            {LL.Cashout.success()}
          </Text>
          <Text type="h03" style={styles.successText}>
            {receiveUsd}
          </Text>
          <Text
            type="h01"
            style={[styles.successText, { color: "rgba(255,255,255,.7)" }]}
          >
            {receiveJmd}
          </Text>
        </SuccessTextAnimation>
      </View>
      <PrimaryBtn
        label="Done"
        onPress={onPressDone}
        btnStyle={styles.buttonContainer}
        txtStyle={{ color: "#002118" }}
      />
    </Screen>
  )
}

export default CashoutSuccess

const useStyles = makeStyles(() => ({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  successText: {
    textAlign: "center",
    color: "#fff",
    marginBottom: 8,
    marginHorizontal: 30,
  },
  buttonContainer: {
    marginBottom: 20,
    marginHorizontal: 20,
    backgroundColor: "#fff",
  },
}))
