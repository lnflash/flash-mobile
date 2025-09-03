import React from "react"
import { Dimensions, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

// assets
import SendSuccess from "@app/assets/illustrations/send-success.svg"

const width = Dimensions.get("window").width

const InviteFriendSuccess = () => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { bottom } = useSafeAreaInsets()

  return (
    <Screen unsafe backgroundColor={colors.accent02}>
      <View style={styles.container}>
        <SendSuccess width={width / 1.2} height={width / 1.2} />
        <Text type="h02" color={colors.white} style={{ textAlign: "center" }}>
          Invitation has been sent to +99897084005 and nodirbek7077@gmail.com
        </Text>
      </View>
      <PrimaryBtn
        label="Done"
        onPress={() => {}}
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
