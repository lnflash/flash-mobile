import { useTheme, Text, Input, Button } from "@rneui/themed"
import { KeyboardAvoidingView, View } from "react-native"
import Modal from "react-native-modal"
import { SafeAreaProvider } from "react-native-safe-area-context"
import React, { useState } from "react"
import { TextInput } from "react-native"
import { makeStyles } from "@rneui/themed"
import { useAppConfig } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { gql } from "@apollo/client"
import {
  useUserUpdateUsernameMutation,
  MyUserIdDocument,
  MyUserIdQuery,
} from "../../graphql/generated"
import useNostrProfile from "@app/hooks/use-nostr-profile"

// store
import { useAppDispatch } from "@app/store/redux"
import { updateUserData } from "@app/store/redux/slices/userSlice"
import { setPreferredRelay } from "@app/utils/nostr"
import { GaloyErrorBox } from "@app/components/atomic/galoy-error-box"

interface UsernameModalProps {
  isVisible: boolean
  closeModal: () => void
}
export const UsernameModal: React.FC<UsernameModalProps> = ({
  isVisible,
  closeModal,
}) => {
  const {
    appConfig: {
      galoyInstance: { lnAddressHostname: lnDomain, relayUrl },
    },
  } = useAppConfig()
  const dispatch = useAppDispatch()
  const [error, setError] = useState<SetAddressError | undefined>()
  const [lnAddress, setLnAddress] = useState("")
  const [nostrPubkey, setNostrPubkey] = useState("")

  const { updateNostrProfile } = useNostrProfile()

  const onChangeLnAddress = (lightningAddress: string) => {
    setLnAddress(lightningAddress)
    setError(undefined)
  }

  const [updateUsername, { loading }] = useUserUpdateUsernameMutation({
    update: (cache, { data }) => {
      if (data?.userUpdateUsername?.user) {
        const userIdQuery = cache.readQuery({
          query: MyUserIdDocument,
        }) as MyUserIdQuery

        const userId = userIdQuery.me?.id

        if (userId) {
          cache.modify({
            id: cache.identify({
              id: userId,
              __typename: "User",
            }),
            fields: {
              username: () => {
                return lnAddress
              },
            },
          })
        }
      }
    },
  })

  const onSetLightningAddress = async () => {
    const validationResult = validateLightningAddress(lnAddress)
    if (!validationResult.valid) {
      setError(validationResult.error)
      return
    }

    const { data, errors } = await updateUsername({
      variables: {
        input: {
          username: lnAddress,
        },
      },
    })

    console.log("Mutation response:", { data, errors })
    console.log("User update errors:", data?.userUpdateUsername?.errors) // Log the errors array
    updateNostrProfile({
      content: {
        name: lnAddress,
        username: lnAddress,
        lud16: `${lnAddress}@${lnDomain}`,
      },
    })
    setPreferredRelay(relayUrl)
    if ((data?.userUpdateUsername?.errors ?? []).length > 0) {
      if (data?.userUpdateUsername?.errors[0]?.code === "USERNAME_ERROR") {
        setError(SetAddressError.ADDRESS_UNAVAILABLE)
      } else {
        setError(SetAddressError.UNKNOWN_ERROR)
      }
      return
    }

    dispatch(updateUserData({ username: lnAddress }))
    closeModal()
  }

  return (
    <SetLightningAddressModalUI
      isVisible={isVisible}
      toggleModal={closeModal}
      error={error}
      lnAddress={lnAddress}
      loading={loading}
      setLnAddress={onChangeLnAddress}
      onSetLightningAddress={onSetLightningAddress}
    />
  )
}

gql`
  mutation userUpdateUsername($input: UserUpdateUsernameInput!) {
    userUpdateUsername(input: $input) {
      errors {
        code
      }
      user {
        id
        username
      }
    }
  }
`

gql`
  query myUserId {
    me {
      id
    }
  }
`

export type SetLightningAddressModalUIProps = {
  isVisible: boolean
  toggleModal: () => void
  onSetLightningAddress: () => void
  loading: boolean
  error?: SetAddressError
  lnAddress: string
  setLnAddress?: (lightningAddress: string) => void
}

export const SetLightningAddressModalUI = ({
  isVisible,
  onSetLightningAddress,
  toggleModal,
  lnAddress,
  setLnAddress,
  error,
}: SetLightningAddressModalUIProps) => {
  const {
    appConfig: {
      galoyInstance: { lnAddressHostname, name: bankName },
    },
  } = useAppConfig()
  const {
    theme: { colors },
  } = useTheme()
  const { LL } = useI18nContext()

  const styles = useStyles()

  const setLightningAddress = () => {
    onSetLightningAddress()
  }

  let errorMessage = ""
  switch (error) {
    case SetAddressError.TOO_SHORT:
      errorMessage = LL.SetAddressModal.Errors.tooShort()
      break
    case SetAddressError.TOO_LONG:
      errorMessage = LL.SetAddressModal.Errors.tooLong()
      break
    case SetAddressError.INVALID_CHARACTER:
      errorMessage = LL.SetAddressModal.Errors.invalidCharacter()
      break
    case SetAddressError.ADDRESS_UNAVAILABLE:
      errorMessage = LL.SetAddressModal.Errors.addressUnavailable()
      break
    case SetAddressError.UNKNOWN_ERROR:
      errorMessage = LL.SetAddressModal.Errors.unknownError()
      break
  }

  return (
    <Modal
      isVisible={isVisible}
      backdropOpacity={100}
      backdropColor={colors.background}
      style={{
        maxHeight: "100%",
      }}
    >
      <KeyboardAvoidingView behavior="position" enabled>
        <View
          style={{
            display: "flex",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              ...styles.hello,
            }}
          >
            {"Hello!"}
          </Text>
        </View>
        <View style={styles.bodyStyle}>
          <Text
            style={{
              ...styles.textStyle,
              height: 50,
              width: "100%",
            }}
          >
            {"what do you want us to call you?"}
          </Text>

          <View style={styles.textInputContainerStyle}>
            <TextInput
              autoCorrect={false}
              autoComplete="off"
              autoCapitalize="none"
              style={styles.textInputStyle}
              onChangeText={setLnAddress}
              value={lnAddress}
              placeholder={"eg: satoshi"}
              placeholderTextColor={colors.grey3}
              keyboardType="default"
            />
          </View>
          {errorMessage && <GaloyErrorBox errorMessage={errorMessage} />}
          <Button
            onPress={() => {
              setLightningAddress()
            }}
          >
            Submit
          </Button>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const SetAddressError = {
  TOO_SHORT: "TOO_SHORT",
  TOO_LONG: "TOO_LONG",
  INVALID_CHARACTER: "INVALID_CHARACTER",
  ADDRESS_UNAVAILABLE: "ADDRESS_UNAVAILABLE",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const

type SetAddressError = (typeof SetAddressError)[keyof typeof SetAddressError]

type ValidateLightningAddressResult =
  | {
      valid: true
    }
  | {
      valid: false
      error: SetAddressError
    }

const validateLightningAddress = (
  lightningAddress: string,
): ValidateLightningAddressResult => {
  if (lightningAddress.length < 3) {
    return {
      valid: false,
      error: SetAddressError.TOO_SHORT,
    }
  }

  if (lightningAddress.length > 50) {
    return {
      valid: false,
      error: SetAddressError.TOO_LONG,
    }
  }

  if (!/^[\p{L}0-9_]+$/u.test(lightningAddress)) {
    return {
      valid: false,
      error: SetAddressError.INVALID_CHARACTER,
    }
  }

  return {
    valid: true,
  }
}

const useStyles = makeStyles(({ colors }) => ({
  bodyStyle: {
    alignItems: "stretch",
    rowGap: 20,
    display: "flex",
    height: "30%",
    marginTop: 50,
    flexDirection: "column",
    justifyContent: "space-between",
    alignContent: "center",
  },
  textStyle: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 20,
  },
  textInputContainerStyle: {
    display: "flex",
    flexDirection: "column",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    minHeight: 60,
    backgroundColor: colors.grey5,
  },
  textInputStyle: {
    paddingTop: 0,
    paddingBottom: 0,
    flex: 1,
    fontSize: 18,
    lineHeight: 18,
    color: colors.black,
  },
  centerAlign: {
    textAlign: "center",
  },
  hello: {
    fontSize: 48,
    color: colors.primary,
  },
}))
