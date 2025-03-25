import React, { useState } from "react"
import { useAppConfig } from "@app/hooks"
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
import { SetUserNameUI } from "./set-username-ui"
import { SetAddressError } from "@app/types/errors"
import { validateLightningAddress } from "@app/utils/validations"

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
  const [uploadingUsername, setUploadingUsername] = useState(false) // Manage loading state here

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
    setUploadingUsername(true)
    const validationResult = validateLightningAddress(lnAddress)
    if (!validationResult.valid) {
      setError(validationResult.error)
      setUploadingUsername(false)
      return
    }

    const { data, errors } = await updateUsername({
      variables: {
        input: {
          username: lnAddress,
        },
      },
    })

    if ((data?.userUpdateUsername?.errors ?? []).length > 0) {
      if (data?.userUpdateUsername?.errors[0]?.code === "USERNAME_ERROR") {
        setError(SetAddressError.ADDRESS_UNAVAILABLE)
      }
      setError(SetAddressError.UNKNOWN_ERROR)
      setUploadingUsername(false)
      return
    }
    await updateNostrProfile({
      content: {
        name: lnAddress,
        username: lnAddress,
        lud16: `${lnAddress}@${lnDomain}`,
        nip05: `${lnAddress}@${lnDomain}`,
      },
    })
    dispatch(updateUserData({ username: lnAddress }))
    setUploadingUsername(false)
    closeModal()
  }

  return (
    <SetUserNameUI
      isVisible={isVisible}
      toggleModal={closeModal}
      error={error}
      lnAddress={lnAddress}
      loading={loading}
      setLnAddress={onChangeLnAddress}
      onSetLightningAddress={onSetLightningAddress}
      uploadingUsername={uploadingUsername}
    />
  )
}
