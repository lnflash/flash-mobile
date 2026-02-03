import React, { useState } from "react"
import { View } from "react-native"
import crashlytics from "@react-native-firebase/crashlytics"
import { Input, Text, makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { gql } from "@apollo/client"
import { useNewUserEmailRegistrationInitiateMutation } from "@app/graphql/generated"

// components
import { Screen } from "../../components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { GaloyErrorBox } from "@app/components/atomic/galoy-error-box"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"

// utils
import { testProps } from "@app/utils/testProps"
import validator from "validator"

gql`
  mutation newUserEmailRegistrationInitiate($input: NewUserEmailRegistrationInitiateInput!) {
    newUserEmailRegistrationInitiate(input: $input) {
      errors {
        message
        code
      }
      emailFlowId
    }
  }
`

type Props = StackScreenProps<RootStackParamList, "emailLoginInitiate">

export const EmailLoginInitiateScreen: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()

  const [emailInput, setEmailInput] = useState<string>("")
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(false)

  const [newUserEmailRegistrationInitiate] = useNewUserEmailRegistrationInitiateMutation()

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

    try {
      const { data } = await newUserEmailRegistrationInitiate({
        variables: {
          input: {
            email: emailInput,
          },
        },
      })

      const errors = data?.newUserEmailRegistrationInitiate?.errors
      const emailFlowId = data?.newUserEmailRegistrationInitiate?.emailFlowId

      if (emailFlowId) {
        navigation.navigate("emailLoginValidate", {
          emailFlowId,
          email: emailInput
        })
      } else if (errors && errors.length > 0) {
        // Handle specific error codes
        const error = errors[0]
        if (error.code === "TOO_MANY_REQUEST") {
          setErrorMessage(LL.errors.tooManyRequestsPhoneCode())
        } else {
          setErrorMessage(error.message || LL.errors.generic())
        }
      } else {
        setErrorMessage(LL.errors.generic())
      }
    } catch (err) {
      if (err instanceof Error) {
        crashlytics().recordError(err)
      }
      setErrorMessage(LL.errors.generic())
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
