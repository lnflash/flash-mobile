import { useEffect, useMemo } from "react"
import { bech32 } from "bech32"

import { useAppConfig } from "@app/hooks"
import { usePaymentRequestQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { setWatchReceiveQRCode } from "@app/utils/watch"

export const WatchReceiveSync: React.FC = () => {
  const isAuthed = useIsAuthed()
  const { appConfig } = useAppConfig()
  const { data } = usePaymentRequestQuery({
    fetchPolicy: "cache-first",
    skip: !isAuthed,
  })

  const receiveData = useMemo(() => {
    const username = data?.me?.username
    const posUrl = appConfig.galoyInstance.posUrl
    const lnAddressHostname = appConfig.galoyInstance.lnAddressHostname

    if (!username || !posUrl || !lnAddressHostname) {
      return null
    }

    const lnurl = bech32.encode(
      "lnurl",
      bech32.toWords(Buffer.from(`${posUrl}/.well-known/lnurlp/${username}`, "utf8")),
      1500,
    )

    const webUrl = `${posUrl}/${username}`

    return {
      receiveQRCode: `${webUrl.toUpperCase()}?lightning=${lnurl.toUpperCase()}`,
      receiveAddress: `${username}@${lnAddressHostname}`,
      receiveLabel: "Paycode",
    }
  }, [
    appConfig.galoyInstance.lnAddressHostname,
    appConfig.galoyInstance.posUrl,
    data?.me?.username,
  ])

  useEffect(() => {
    if (!receiveData) {
      return
    }
    setWatchReceiveQRCode(receiveData)
  }, [receiveData])

  return null
}
