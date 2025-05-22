import React, { useState } from "react"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { View, TextInput, Image, Dimensions } from "react-native"

// components
import { GaloyErrorBox } from "@app/components/atomic/galoy-error-box"
import { PrimaryBtn } from "@app/components/buttons"
import { Screen } from "@app/components/screen"

// hooks
import useNostrProfile from "@app/hooks/use-nostr-profile"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useAppConfig } from "@app/hooks"

// gql
import {
  useUserUpdateUsernameMutation,
  MyUserIdDocument,
  MyUserIdQuery,
} from "../../graphql/generated"

// store
import { useAppDispatch } from "@app/store/redux"
import { updateUserData } from "@app/store/redux/slices/userSlice"

// utils
import { setPreferredRelay } from "@app/utils/nostr"
import { validateLightningAddress } from "@app/utils/validations"
import { SetAddressError } from "@app/types/errors"

// assets
import FlashMascot from "@app/assets/images/Flash-Mascot.png"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

const { width } = Dimensions.get("window")

type Props = StackScreenProps<RootStackParamList, "UsernameSet">

export const UsernameSet: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch()
  const { updateNostrProfile } = useNostrProfile()
  const { lnAddressHostname, relayUrl, name } = useAppConfig().appConfig.galoyInstance
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const styles = useStyles()

  const [error, setError] = useState<SetAddressError | undefined>()
  const [lnAddress, setLnAddress] = useState("")

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
    } else {
      const { data, errors } = await updateUsername({
        variables: {
          input: {
            username: lnAddress,
          },
        },
      })

      console.log("Mutation response:", data?.userUpdateUsername)

      updateNostrProfile({
        content: {
          name: lnAddress,
          username: lnAddress,
          lud16: `${lnAddress}@${lnAddressHostname}`,
          nip05: `${lnAddress}@${lnAddressHostname}`,
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
      navigation.reset({
        index: 0,
        routes: [{ name: "Welcome" }],
      })
    }
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
    <Screen backgroundColor={colors.background}>
      <View style={styles.wrapper}>
        <Image source={FlashMascot} style={styles.image} />
        <View style={styles.container}>
          <Text type="h06">{LL.SetAddressModal.helloText()}</Text>
          <Text type="h02" style={styles.title}>
            {LL.SetAddressModal.whoAreYou()}
          </Text>
          <Text type="bm" color={colors.placeholder} style={styles.caption}>
            {LL.SetAddressModal.usernameHint({ bankName: name })}
          </Text>
          <TextInput
            autoCorrect={false}
            autoComplete="off"
            autoCapitalize="none"
            style={styles.textInputStyle}
            onChangeText={setLnAddress}
            value={lnAddress}
            placeholder={LL.SetAddressModal.placeholder()}
            placeholderTextColor={colors.grey3}
            keyboardType="default"
          />
          {errorMessage && <GaloyErrorBox errorMessage={errorMessage} />}
        </View>
        <PrimaryBtn
          label={LL.SetAddressModal.save()}
          disabled={lnAddress.length < 3}
          onPress={onSetLightningAddress}
          btnStyle={{ marginBottom: 20 }}
        />
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    flex: 1,
    paddingHorizontal: 20,
  },
  image: {
    width: width / 1.5,
    height: width / 1.5,
    position: "absolute",
    right: 20,
    top: 20,
  },
  container: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    marginBottom: 50,
  },
  caption: {
    marginLeft: 5,
    marginBottom: 5,
  },
  textInputStyle: {
    paddingVertical: 15,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
    fontSize: 18,
    fontFamily: "Sora-Regular",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.button01,
    marginBottom: 10,
  },
}))
