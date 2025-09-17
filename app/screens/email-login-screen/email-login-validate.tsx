import React, { useCallback, useState } from "react"
import analytics from "@react-native-firebase/analytics"
import crashlytics from "@react-native-firebase/crashlytics"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { gql } from "@apollo/client"
import { useNewUserEmailRegistrationValidateMutation } from "@app/graphql/generated"

// components
import { CodeInput } from "@app/components/code-input"

// hooks
import { useAppConfig } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

gql`
  mutation newUserEmailRegistrationValidate($input: NewUserEmailRegistrationValidateInput!) {
    newUserEmailRegistrationValidate(input: $input) {
      errors {
        message
        code
      }
      authToken
      totpRequired
    }
  }
`

type Props = StackScreenProps<RootStackParamList, "emailLoginValidate">

export const EmailLoginValidateScreen: React.FC<Props> = ({ navigation, route }) => {
  const { LL } = useI18nContext()
  const { saveToken } = useAppConfig()

  const [errorMessage, setErrorMessage] = useState<string>("")
  const [loading, setLoading] = useState(false)

  const { emailFlowId, email } = route.params

  const [newUserEmailRegistrationValidate] = useNewUserEmailRegistrationValidateMutation()

  const send = useCallback(
    async (code: string) => {
      try {
        setLoading(true)

        const { data } = await newUserEmailRegistrationValidate({
          variables: {
            input: {
              code,
              emailFlowId,
            },
          },
        })

        const authToken = data?.newUserEmailRegistrationValidate?.authToken
        const totpRequired = data?.newUserEmailRegistrationValidate?.totpRequired
        const errors = data?.newUserEmailRegistrationValidate?.errors

        if (authToken) {
          if (totpRequired) {
            navigation.navigate("totpLoginValidate", {
              authToken,
            })
          } else {
            analytics().logLogin({ method: "email" })
            saveToken(authToken)
            navigation.reset({
              index: 0,
              routes: [{ name: "authenticationCheck" }],
            })
          }
        } else if (errors && errors.length > 0) {
          const error = errors[0]
          if (error.code === "INVALID_CODE") {
            setErrorMessage(LL.errors.generic())
          } else if (error.code === "TOO_MANY_REQUEST") {
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
    },
    [emailFlowId, navigation, saveToken, LL, newUserEmailRegistrationValidate],
  )

  const header = LL.EmailLoginValidateScreen.header({ email })

  return (
    <CodeInput
      send={send}
      header={header}
      loading={loading}
      errorMessage={errorMessage}
      setErrorMessage={setErrorMessage}
    />
  )
}
