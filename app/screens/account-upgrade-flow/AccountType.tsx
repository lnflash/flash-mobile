import React, { useEffect } from "react"
import { TouchableOpacity, View } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { AccountLevel } from "@app/graphql/generated"

// components
import { Screen } from "@app/components/screen"

// hooks
import { useLevel } from "@app/graphql/level-context"

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import {
  setAccountUpgrade,
  setPersonalInfo,
} from "@app/store/redux/slices/accountUpgradeSlice"

// utils
import { fetchUser } from "@app/supabase"
import { parsePhoneNumber } from "libphonenumber-js"

type Props = StackScreenProps<RootStackParamList, "AccountType">

const AccountType: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { currentLevel } = useLevel()

  const { userData } = useAppSelector((state) => state.user)

  useEffect(() => {
    fetchUserFromSupabase()
  }, [])

  const fetchUserFromSupabase = async () => {
    if (userData.phone) {
      const res = await fetchUser(userData.phone)
      const parsedPhone = parsePhoneNumber(userData.phone)

      dispatch(setAccountUpgrade({ id: res.id }))
      dispatch(
        setPersonalInfo({
          fullName: res.name,
          countryCode: parsedPhone.country,
          phoneNumber: parsedPhone.nationalNumber,
          email: res.email,
        }),
      )
    }
  }

  const onPress = (accountType: string) => {
    dispatch(setAccountUpgrade({ accountType }))
    navigation.navigate("PersonalInformation")
  }

  return (
    <Screen>
      {currentLevel === AccountLevel.Zero && (
        <TouchableOpacity style={styles.card} onPress={() => onPress("personal")}>
          <Icon name={"person"} size={35} color={colors.grey1} type="ionicon" />
          <View style={styles.textWrapper}>
            <Text type="bl" bold>
              Personal
            </Text>
            <Text type="bm" style={{ marginTop: 2 }}>
              For individual use, no additional info needed
            </Text>
          </View>
          <Icon name={"chevron-forward"} size={25} color={colors.grey2} type="ionicon" />
        </TouchableOpacity>
      )}
      {(currentLevel === AccountLevel.Zero || currentLevel === AccountLevel.One) && (
        <TouchableOpacity style={styles.card} onPress={() => onPress("pro")}>
          <Icon name={"briefcase"} size={35} color={colors.grey1} type="ionicon" />
          <View style={styles.textWrapper}>
            <Text type="bl" bold>
              Pro
            </Text>
            <Text type="bm" style={{ marginTop: 2 }}>
              Accept payments as a Pro Flashpoint. Business Name & Address required
            </Text>
          </View>
          <Icon name={"chevron-forward"} size={25} color={colors.grey2} type="ionicon" />
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.card} onPress={() => onPress("merchant")}>
        <Icon name={"cart"} size={35} color={colors.grey1} type="ionicon" />
        <View style={styles.textWrapper}>
          <Text type="bl" bold>
            Merchant
          </Text>
          <Text type="bm" style={{ marginTop: 2 }}>
            Give rewards as a Merchant Flashpoint. ID and Bank account info required
          </Text>
        </View>
        <Icon name={"chevron-forward"} size={25} color={colors.grey2} type="ionicon" />
      </TouchableOpacity>
    </Screen>
  )
}

export default AccountType

const useStyles = makeStyles(({ colors }) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.grey5,
    padding: 15,
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 20,
  },
  textWrapper: {
    flex: 1,
    marginHorizontal: 15,
  },
}))
