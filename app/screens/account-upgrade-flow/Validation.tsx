import React, { useCallback, useState } from "react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackScreenProps } from "@react-navigation/stack"
import { makeStyles, Text } from "@rneui/themed"
import { Alert, View } from "react-native"

// components
import { Screen } from "@app/components/screen"
import { InputField, ProgressSteps } from "@app/components/account-upgrade-flow"

// hooks
import { useActivityIndicator, useAppConfig } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useAppSelector } from "@app/store/redux"
import {
  AccountLevel,
  HomeAuthedDocument,
  useUserEmailRegistrationInitiateMutation,
  useUserLoginUpgradeMutation,
} from "@app/graphql/generated"

// utils
import { PhoneCodeChannelToFriendlyName } from "../phone-auth-screen/request-phone-code-login"

type Props = StackScreenProps<RootStackParamList, "Validation">

const Validation: React.FC<Props> = ({ navigation, route }) => {
  const { phone, channel } = route.params
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { saveToken } = useAppConfig()
  const { toggleActivityIndicator } = useActivityIndicator()
  const { accountType, numOfSteps, personalInfo } = useAppSelector(
    (state) => state.accountUpgrade,
  )

  const [code, setCode] = useState<string>()
  const [errorMsg, setErrorMsg] = useState<string>()

  const [registerUserEmail] = useUserEmailRegistrationInitiateMutation()
  const [userLoginUpgradeMutation] = useUserLoginUpgradeMutation({
    fetchPolicy: "no-cache",
    refetchQueries: [HomeAuthedDocument],
  })

  const send = useCallback(
    async (code: string) => {
      try {
        toggleActivityIndicator(true)
        const { data } = await userLoginUpgradeMutation({
          variables: { input: { phone, code } },
        })

        if (data?.userLoginUpgrade?.success) {
          if (data?.userLoginUpgrade?.authToken) {
            saveToken(data?.userLoginUpgrade?.authToken)
          }

          // Save user email if provided
          if (personalInfo.email && personalInfo.email.length > 0) {
            await registerUserEmail({
              variables: { input: { email: personalInfo.email } },
            })
          }

          if (accountType === AccountLevel.One) {
            navigation.replace("AccountUpgradeSuccess")
          } else {
            Alert.alert(
              LL.PhoneRegistrationValidateScreen.successTitle(),
              LL.AccountUpgrade.successUpgrade({ accountType: "PERSONAL" }),
              [
                {
                  text: "Continue",
                  onPress: () => navigation.replace("BusinessInformation"),
                },
              ],
            )
          }
        } else {
          setErrorMsg(data?.userLoginUpgrade.errors[0].message)
        }
        setCode("")
      } catch (err) {
        setCode("")
      } finally {
        toggleActivityIndicator(false)
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
    <Screen
      preset="scroll"
      keyboardOffset="navigationHeader"
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 1 }}
    >
      <ProgressSteps numOfSteps={numOfSteps} currentStep={3} />
      <View style={styles.wrapper}>
        <Text type="p1" style={styles.header}>
          {LL.PhoneLoginValidationScreen.header({
            channel: PhoneCodeChannelToFriendlyName[channel],
            phoneNumber: phone,
          })}
        </Text>
        <InputField
          label={LL.AccountUpgrade.validationCode()}
          placeholder="123456"
          value={code}
          errorMsg={errorMsg}
          onChangeText={onChangeText}
          keyboardType="number-pad"
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
