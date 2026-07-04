import { useEffect, useMemo } from "react"

import { useAppConfig } from "@app/hooks"
import { usePaymentRequestQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { getPaycodeQRContent } from "@app/utils/pay-code"
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

    return {
      receiveQRCode: getPaycodeQRContent(posUrl, username),
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
