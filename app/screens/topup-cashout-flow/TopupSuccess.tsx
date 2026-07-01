import React from "react"
import { View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import {
  SuccessIconAnimation,
  SuccessTextAnimation,
} from "@app/components/success-animation"
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { GaloyIcon } from "@app/components/atomic/galoy-icon"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type Props = StackScreenProps<RootStackParamList, "TopupSuccess">

const TopupSuccess: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { bottom } = useSafeAreaInsets()

  const onPressDone = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: "Primary" }],
    })
  }

  return (
    <Screen unsafe backgroundColor={colors.accent02}>
      <View style={styles.container}>
        <SuccessIconAnimation>
          <GaloyIcon name={"send-success"} size={128} />
        </SuccessIconAnimation>
        <SuccessTextAnimation>
          <Text type="h01" style={[styles.successText, { marginTop: 32 }]}>
            {LL.PaymentSuccessScreen.title()}
          </Text>
        </SuccessTextAnimation>
      </View>
      <PrimaryBtn
        label={LL.PaymentSuccessScreen.done()}
        onPress={onPressDone}
        btnStyle={{
          backgroundColor: "#fff",
          marginHorizontal: 20,
          marginBottom: bottom || 20,
        }}
        txtStyle={{ color: "#002118" }}
      />
    </Screen>
  )
}

export default TopupSuccess

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
  },
}))
