import React, { useCallback, useState } from "react"
import analytics from "@react-native-firebase/analytics"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import axios, { isAxiosError } from "axios"

// components
import { CodeInput } from "@app/components/code-input"

// hooks
import { useAppConfig } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

type Props = StackScreenProps<RootStackParamList, "emailLoginValidate">

export const EmailLoginValidateScreen: React.FC<Props> = ({ navigation, route }) => {
  const { LL } = useI18nContext()
  const { authUrl } = useAppConfig().appConfig.galoyInstance
  const { saveToken } = useAppConfig()

  const [errorMessage, setErrorMessage] = useState<string>("")
  const [loading, setLoading] = useState(false)

  const { emailLoginId, email } = route.params

  const send = useCallback(
    async (code: string) => {
      try {
        setLoading(true)

        const url = `${authUrl}/auth/email/login`

        const res2 = await axios({
          url,
          method: "POST",
          data: {
            code,
            emailLoginId,
          },
        })

        const authToken = res2.data.result.authToken
        const totpRequired = res2.data.result.totpRequired

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
        } else {
          throw new Error(LL.common.errorAuthToken())
        }
      } catch (err) {
        console.error(err, "error axios")
        if (isAxiosError(err)) {
          console.log(err.message) // Gives you the basic error message
          console.log(err.response?.data) // Gives you the response payload from the server
          console.log(err.response?.status) // Gives you the HTTP status code
          console.log(err.response?.headers) // Gives you the response headers

          // If the request was made but no response was received
          if (!err.response) {
            console.log(err.request)
          }

          if (err.response?.data?.error) {
            setErrorMessage(err.response?.data?.error)
          } else {
            setErrorMessage(err.message)
          }
        }
      } finally {
        setLoading(false)
      }
    },
    [emailLoginId, navigation, authUrl, saveToken, LL],
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
