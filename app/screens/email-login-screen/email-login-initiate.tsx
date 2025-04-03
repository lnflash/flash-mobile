import React, { useEffect, useState } from "react"
import { View } from "react-native"
import axios, { isAxiosError } from "axios"
import { Input, Text, makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "../../components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { GaloyErrorBox } from "@app/components/atomic/galoy-error-box"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useAppConfig } from "@app/hooks"

// utils
import { testProps } from "@app/utils/testProps"
import validator from "validator"

type Props = StackScreenProps<RootStackParamList, "emailLoginInitiate">

export const EmailLoginInitiateScreen: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { authUrl } = useAppConfig().appConfig.galoyInstance

  const [emailInput, setEmailInput] = useState<string>("")
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(false)

  const updateInput = (text: string) => {
    setEmailInput(text)
    setErrorMessage("")
  }

  const submit = async () => {
    if (!validator.isEmail(emailInput)) {
      setErrorMessage(LL.EmailLoginInitiateScreen.invalidEmail())
      return
    }

    setLoading(true)

    const url = `${authUrl}/auth/email/code`

    try {
      const res = await axios({
        url,
        method: "POST",
        data: {
          email: emailInput,
        },
      })
      // TODO: manage error on ip rate limit
      // TODO: manage error when trying the same email too often
      const emailLoginId = res.data.result

      if (emailLoginId) {
        console.log({ emailLoginId })
        navigation.navigate("emailLoginValidate", { emailLoginId, email: emailInput })
      } else {
        console.warn("no flow returned")
      }
    } catch (err) {
      console.error(err, "error in setEmailMutation")
      if (isAxiosError(err)) {
        console.log(err.message) // Gives you the basic error message
        console.log(err.response?.data) // Gives you the response payload from the server
        console.log(err.response?.status) // Gives you the HTTP status code
        console.log(err.response?.headers) // Gives you the response headers

        // If the request was made but no response was received
        if (!err.response) {
          console.log(err.request)
        }
        setErrorMessage(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen
      preset="scroll"
      style={styles.screenStyle}
      keyboardOffset="navigationHeader"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.viewWrapper}>
        <Text type={"p1"} style={styles.header}>
          {LL.EmailLoginInitiateScreen.header()}
        </Text>
        <Input
          {...testProps(LL.EmailRegistrationInitiateScreen.placeholder())}
          placeholder={LL.EmailRegistrationInitiateScreen.placeholder()}
          autoCapitalize="none"
          containerStyle={styles.inputContainer}
          inputContainerStyle={styles.inputContainerStyle}
          renderErrorMessage={false}
          textContentType="emailAddress"
          keyboardType="email-address"
          value={emailInput}
          onChangeText={updateInput}
          autoFocus={true}
        />
        {errorMessage && <GaloyErrorBox errorMessage={errorMessage} />}
      </View>
      <PrimaryBtn
        label={LL.EmailLoginInitiateScreen.send()}
        loading={loading}
        disabled={!emailInput}
        onPress={submit}
      />
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    padding: 20,
    flexGrow: 1,
  },
  inputContainer: {
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 48,
  },
  header: {
    marginBottom: 20,
  },
  viewWrapper: {
    flex: 1,
  },
  inputContainerStyle: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 10,
    borderColor: colors.border02,
    borderRadius: 10,
  },
}))
