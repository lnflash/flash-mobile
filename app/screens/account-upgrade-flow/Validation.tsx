import React, { useCallback, useState } from "react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackScreenProps } from "@react-navigation/stack"
import { makeStyles, Text } from "@rneui/themed"
import { View } from "react-native"

// components
import { Screen } from "@app/components/screen"
import { InputField } from "@app/components/account-upgrade-flow"

// hooks
import { useAccountUpgrade, useActivityIndicator, useAppConfig } from "@app/hooks"
import { useUserLoginUpgradeMutation } from "@app/graphql/generated"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useAppSelector } from "@app/store/redux"

// utils
import { PhoneCodeChannelToFriendlyName } from "../phone-auth-screen/request-phone-code-login"

type Props = StackScreenProps<RootStackParamList, "Validation">

const Validation: React.FC<Props> = ({ navigation, route }) => {
  const { phone, channel } = route.params
  const styles = useStyles()
  const { accountType, personalInfo } = useAppSelector((state) => state.accountUpgrade)
  const { LL } = useI18nContext()
  const { saveToken } = useAppConfig()
  const { toggleActivityIndicator } = useActivityIndicator()
  const { submitAccountUpgrade } = useAccountUpgrade()

  const [code, setCode] = useState<string>()
  const [errorMsg, setErrorMsg] = useState<string>()

  const [userLoginUpgradeMutation] = useUserLoginUpgradeMutation({
    fetchPolicy: "no-cache",
  })

  const send = useCallback(
    async (code: string) => {
      try {
        toggleActivityIndicator(true)
        const { data } = await userLoginUpgradeMutation({
          variables: { input: { phone, code } },
        })
        toggleActivityIndicator(false)

        const success = data?.userLoginUpgrade?.success
        const authToken = data?.userLoginUpgrade?.authToken
        if (success) {
          if (authToken) {
            saveToken(authToken)
          }
          if (accountType === "personal") {
            const res = await submitAccountUpgrade()
            if (res) navigation.replace("AccountUpgradeSuccess")
            else alert("Something went wrong. Please, try again later.")
          } else {
            navigation.replace("BusinessInformation")
          }
        } else {
          console.log(">>>>>>>>>>>>>>>>>", data?.userLoginUpgrade)
          setErrorMsg(data?.userLoginUpgrade.errors[0].message)
        }
        setCode("")
      } catch (err) {
        console.log("ERROR>>>>>>>>>", err)
        setCode("")
      }
    },
    [userLoginUpgradeMutation, saveToken, phone],
  )

  const onChangeText = (code: string) => {
    if (code.length > 6) {
      return
    }

    setCode(code)
    if (code.length === 6) {
      send(code)
    }
  }

  return (
    <Screen>
      <View style={styles.wrapper}>
        <Text type="p1" style={styles.header}>
          {LL.PhoneLoginValidationScreen.header({
            channel: PhoneCodeChannelToFriendlyName[channel],
            phoneNumber: phone,
          })}
        </Text>
        <InputField
          label="Validation code"
          placeholder="123456"
          value={code}
          errorMsg={errorMsg}
          onChangeText={onChangeText}
        />
      </View>
    </Screen>
  )
}

export default Validation

const useStyles = makeStyles(() => ({
  wrapper: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 30,
  },
}))
