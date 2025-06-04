import React from "react"
import { View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { StackScreenProps } from "@react-navigation/stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { makeStyles, Text } from "@rneui/themed"

// components
import { SuccessIconAnimation } from "@app/components/success-animation"
import { GaloyIcon } from "@app/components/atomic/galoy-icon"
import { PrimaryBtn } from "@app/components/buttons"

// store
import { usePersistentStateContext } from "@app/store/persistent-state"

type Props = StackScreenProps<RootStackParamList, "BackupComplete">

const BackupComplete: React.FC<Props> = ({ navigation }) => {
  const bottom = useSafeAreaInsets().bottom
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { updateState } = usePersistentStateContext()

  const onContinue = () => {
    updateState((state: any) => {
      if (state)
        return {
          ...state,
          backedUpBtcWallet: true,
        }
      return undefined
    })
    navigation.navigate("BackupOptions")
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <SuccessIconAnimation>
          <GaloyIcon name={"send-success"} size={128} />
        </SuccessIconAnimation>
        <Text type="h02" bold color="#fff" style={{ marginTop: 30, marginBottom: 20 }}>
          {LL.BackupComplete.title()}
        </Text>
        <Text type="bl" color="#ebebeb" style={{ textAlign: "center" }}>
          {LL.BackupComplete.description()}
        </Text>
      </View>
      <PrimaryBtn
        label={LL.BackupComplete.complete()}
        onPress={onContinue}
        btnStyle={{ backgroundColor: "#fff", marginBottom: bottom || 10 }}
        txtStyle={{ color: "#002118" }}
      />
    </View>
  )
}

export default BackupComplete

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: colors.accent02,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
}))
