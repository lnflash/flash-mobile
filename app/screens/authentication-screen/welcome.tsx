import React, { useEffect } from "react"
import { Text, Image, View } from "react-native"
import { makeStyles, useTheme } from "@rneui/themed"
import * as Animatable from "react-native-animatable"
import LinearGradient from "react-native-linear-gradient"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackScreenProps } from "@react-navigation/stack"

// assets
import AppLogo from "../../assets/logo/blink-logo-icon.png"

// hooks
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useAuthQuery, useRedeemInviteMutation } from "@app/graphql/generated"
import { redeemPendingInvite } from "../invite-friend/HandleInviteDeepLink"

// components
import { PrimaryBtn } from "@app/components/buttons"

type Props = StackScreenProps<RootStackParamList, "Welcome">

export const Welcome: React.FC<Props> = ({ navigation }) => {
  const isAuthed = useIsAuthed()
  const styles = useStyles()
  const { colors } = useTheme().theme

  const { data } = useAuthQuery({ skip: !isAuthed })
  const [redeemInviteMutation] = useRedeemInviteMutation()

  useEffect(() => {
    // Check and redeem pending invite when user reaches Welcome screen
    if (isAuthed) {
      redeemPendingInvite(redeemInviteMutation, true).then((result) => {
        if (result.success) {
          console.log("Invite redeemed successfully after onboarding")
        }
      })
    }
  }, [isAuthed, redeemInviteMutation])

  const onPressStart = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: "Primary" }],
    })
  }

  return (
    <Animatable.View style={{ flex: 1 }} animation={"fadeInUp"}>
      <LinearGradient
        colors={[colors.background, colors.primary5]}
        style={styles.container}
      >
        <Image source={AppLogo} style={styles.logo} />
        <Animatable.Text
          animation="bounce"
          easing="ease-in"
          iterationCount="infinite"
          style={styles.bouncingText}
        >
          <Text style={styles.title}>Welcome {data?.me?.username}!</Text>
        </Animatable.Text>
        <View style={styles.btnContainer}>
          <PrimaryBtn label="Let’s get started 🚀" onPress={onPressStart} />
        </View>
      </LinearGradient>
    </Animatable.View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  bouncingText: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: 20,
  },
  title: {
    fontSize: 36,
    color: colors.primary3,
    textAlign: "center",
    textShadowColor: "rgba(40, 110, 12, 0.3)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  logo: {
    width: "30%",
    height: "70%",
    resizeMode: "contain",
    shadowColor: colors.black, // Shadow color
    shadowOffset: { width: 0, height: 5 }, // Shadow position
    shadowOpacity: 0.3, // Shadow transparency
    shadowRadius: 8, // Shadow blur
  },
  btnContainer: {
    width: "80%",
  },
}))
