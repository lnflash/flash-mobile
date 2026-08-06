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

  const onPressDone = () => {
    navigation.popToTop()
  }

  return (
    <Screen unsafe backgroundColor={colors.accent02}>
      <View style={styles.container}>
        <SendSuccess width={width / 1.2} height={width / 1.2} />
        <Text type="h02" color={colors.white} style={styles.title}>
          {LL.InviteFriend.invitationSuccessTitle({ value: contact })}
        </Text>
      </View>
      <PrimaryBtn
        label={LL.InviteFriend.done()}
        onPress={onPressDone}
        // eslint-disable-next-line react-native/no-inline-styles
        btnStyle={[styles.doneBtn, { marginBottom: bottom + 10 }]}
        txtStyle={styles.doneBtnText}
      />
    </Screen>
  )
}

export default InviteFriendSuccess

// Brand text color for the Done button; no exact theme token, kept as a named
// const so react-native/no-color-literals passes.
const DONE_BTN_TEXT_COLOR = "#002118"

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    textAlign: "center",
  },
  doneBtn: {
    backgroundColor: colors.white,
    marginHorizontal: 20,
  },
  doneBtnText: {
    color: DONE_BTN_TEXT_COLOR,
  },
}))
