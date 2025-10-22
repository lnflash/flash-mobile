import { gql } from "@apollo/client"
import { CodeInput } from "@app/components/code-input"
import { useUserEmailRegistrationValidateMutation } from "@app/graphql/generated"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { RouteProp, useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { useCallback, useState } from "react"
import { Alert } from "react-native"

/**
 * Validates the email verification code for existing users adding email to their account.
 *
 * For TRIAL accounts (AccountLevel.Zero), this mutation also handles the schema upgrade
 * from 'username_password_deviceid_v0' to support email authentication.
 * The backend will automatically upgrade TRIAL accounts to PERSONAL (AccountLevel.One)
 * when email verification is successful.
 */
gql`
  mutation userEmailRegistrationValidate($input: UserEmailRegistrationValidateInput!) {
    userEmailRegistrationValidate(input: $input) {
      errors {
        message
      }
      me {
        id
        email {
          address
          verified
        }
      }
    }
  }
`

type Props = {
  route: RouteProp<RootStackParamList, "emailRegistrationValidate">
}

export const EmailRegistrationValidateScreen: React.FC<Props> = ({ route }) => {
  const navigation =
    useNavigation<StackNavigationProp<RootStackParamList, "emailRegistrationValidate">>()
  const { LL } = useI18nContext()

  const [errorMessage, setErrorMessage] = useState<string>("")
  const [loading, setLoading] = useState(false)

  const [emailVerify] = useUserEmailRegistrationValidateMutation()

  const { emailRegistrationId, email } = route.params

  const send = useCallback(
    async (code: string) => {
      try {
        setLoading(true)

        const res = await emailVerify({
          variables: { input: { code, emailRegistrationId } },
        })

        // Handle validation errors (invalid code, expired code, etc.)
        if (res.data?.userEmailRegistrationValidate.errors) {
          const error = res.data.userEmailRegistrationValidate.errors[0]?.message
          // TODO: manage translation for errors
          setErrorMessage(error)
        }

        // Email verification successful
        if (res.data?.userEmailRegistrationValidate.me?.email?.verified) {
          Alert.alert(
            LL.common.success(),
            LL.EmailRegistrationValidateScreen.success({ email }),
            [
              {
                text: LL.common.ok(),
                onPress: () => {
                  /**
                   * Use navigation.reset() instead of navigation.navigate() to:
                   * 1. Clear the navigation stack
                   * 2. Force re-authentication via authenticationCheck
                   * 3. Refresh all user data (including account level)
                   *
                   * This is critical for TRIAL accounts, as the backend upgrades them
                   * to PERSONAL (AccountLevel.One) during email verification.
                   * The reset ensures the app displays the updated account level.
                   */
                  navigation.reset({
                    index: 0,
                    routes: [{ name: "authenticationCheck" }],
                  })
                },
              },
            ],
          )
        } else {
          throw new Error(LL.common.errorAuthToken())
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    },
    [emailVerify, emailRegistrationId, navigation, LL, email],
  )

  const header = LL.EmailRegistrationValidateScreen.header({ email })

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
