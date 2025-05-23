import React, { useEffect, useState } from "react"
import { View, TextInput } from "react-native"
import CustomModal from "../custom-modal/custom-modal"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { useAppConfig } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { GaloyErrorBox } from "../atomic/galoy-error-box"
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
import { getSecretKey, setPreferredRelay } from "@app/utils/nostr"
import { getPublicKey } from "nostr-tools"

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

export const SetLightningAddressModal = ({
  isVisible,
  toggleModal,
}: SetLightningAddressModalProps) => {
  const {
    appConfig: {
      galoyInstance: { lnAddressHostname: lnDomain },
    },
  } = useAppConfig()
  const dispatch = useAppDispatch()
  const [error, setError] = useState<SetAddressError | undefined>()
  const [lnAddress, setLnAddress] = useState("")
  const [nostrPubkey, setNostrPubkey] = useState("")
  const { updateNostrProfile } = useNostrProfile()

  useEffect(() => {
    async function getNostrPubkey() {
      let secretKey = await getSecretKey()
      if (secretKey) setNostrPubkey(getPublicKey(secretKey))
      else console.warn("NOSTR SECRET KEY NOT FOUND")
    }
    getNostrPubkey()
  }, [])

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

    console.log("Mutation response:", { data, errors }) // Log full response for debugging
    console.log("User update errors:", data?.userUpdateUsername?.errors) // Log the errors array
    updateNostrProfile({
      content: {
        name: lnAddress,
        username: lnAddress,
        lud16: `${lnAddress}@${lnDomain}`,
        nip05: lnAddress,
      },
    })
    setPreferredRelay()
    if ((data?.userUpdateUsername?.errors ?? []).length > 0) {
      if (data?.userUpdateUsername?.errors[0]?.code === "USERNAME_ERROR") {
        setError(SetAddressError.ADDRESS_UNAVAILABLE)
      } else {
        setError(SetAddressError.UNKNOWN_ERROR)
      }
      return
    }

    dispatch(updateUserData({ username: lnAddress }))
    toggleModal()
  }

  return (
    <SetLightningAddressModalUI
      isVisible={isVisible}
      toggleModal={toggleModal}
      error={error}
      lnAddress={lnAddress}
      loading={loading}
      setLnAddress={onChangeLnAddress}
      onSetLightningAddress={onSetLightningAddress}
    />
  )
}

export type SetLightningAddressModalProps = {
  isVisible: boolean
  toggleModal: () => void
}

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
  toggleModal,
  onSetLightningAddress,
  lnAddress,
  setLnAddress,
  loading,
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
    <CustomModal
      title={LL.SetAddressModal.title({ bankName })}
      minHeight={"50%"}
      toggleModal={toggleModal}
      isVisible={isVisible}
      primaryButtonTitle={LL.SetAddressModal.title({ bankName })}
      primaryButtonLoading={loading}
      primaryButtonOnPress={setLightningAddress}
      primaryButtonDisabled={!lnAddress}
      body={
        <View style={styles.bodyStyle}>
          <View style={styles.textInputContainerStyle}>
            <TextInput
              autoCorrect={false}
              autoComplete="off"
              autoCapitalize="none"
              style={styles.textInputStyle}
              onChangeText={setLnAddress}
              value={lnAddress}
              placeholder={"your-username"}
              placeholderTextColor={colors.grey3}
              keyboardType="default"
            />
          </View>
          <Text style={{ textAlign: "center" }} type={"p1"}>{`${
            lnAddress || "___"
          }@${lnAddressHostname}`}</Text>
          {errorMessage && <GaloyErrorBox errorMessage={errorMessage} />}
          <Text type={"p1"} style={styles.centerAlign}>
            {LL.SetAddressModal.receiveMoney({ bankName })}
            <Text color={colors.warning} bold={true}>
              {" "}
              {LL.SetAddressModal.itCannotBeChanged()}
            </Text>
          </Text>
        </View>
      }
    />
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
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    alignItems: "stretch",
    rowGap: 20,
  },
  textInputContainerStyle: {
    display: "flex",
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    minHeight: 60,
    backgroundColor: colors.grey5,
    alignItems: "center",
    justifyContent: "space-between",
  },
  textInputStyle: {
    paddingTop: 0,
    paddingBottom: 0,
    flex: 1,
    textAlignVertical: "center",
    fontSize: 18,
    lineHeight: 24,
    color: colors.black,
  },
  centerAlign: {
    textAlign: "center",
  },
}))
