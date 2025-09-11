import React from "react"
import { Dimensions, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackScreenProps } from "@react-navigation/stack"
import { useI18nContext } from "@app/i18n/i18n-react"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

// assets
import SendSuccess from "@app/assets/illustrations/send-success.svg"

const width = Dimensions.get("window").width

type Props = StackScreenProps<RootStackParamList, "InviteFriendSuccess">

const InviteFriendSuccess: React.FC<Props> = ({ navigation, route }) => {
  const { LL } = useI18nContext()
  const { bottom } = useSafeAreaInsets()
  const { colors } = useTheme().theme
  const styles = useStyles()
  
  // Get the contact from route params, or use default
  const contact = route.params?.contact || "your friend"
  const method = route.params?.method || "EMAIL"

  const onPressDone = () => {
    navigation.popToTop()
  }

  return (
    <Screen unsafe backgroundColor={colors.accent02}>
      <View style={styles.container}>
        <SendSuccess width={width / 1.2} height={width / 1.2} />
        <Text type="h02" color={colors.white} style={{ textAlign: "center" }}>
          {LL.InviteFriend.invitationSuccessTitle({ value: contact })}
        </Text>
      </View>
      <PrimaryBtn
        label={LL.InviteFriend.done()}
        onPress={onPressDone}
        btnStyle={{
          backgroundColor: "#fff",
          marginBottom: bottom + 10,
          marginHorizontal: 20,
        }}
        txtStyle={{ color: "#002118" }}
      />
    </Screen>
  )
}

export default InviteFriendSuccess

const useStyles = makeStyles(() => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
}))
