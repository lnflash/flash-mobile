import Share from "react-native-share"

import { gql } from "@apollo/client"
import {
  useSettingsScreenQuery,
  useWalletCsvTransactionsLazyQuery,
} from "@app/graphql/generated"
import { getUsdWallet } from "@app/graphql/wallets-utils"
import { useI18nContext } from "@app/i18n/i18n-react"
import crashlytics from "@react-native-firebase/crashlytics"

import { SettingsRow } from "../row"
import { useBreez } from "@app/hooks"

gql`
  query ExportCsvSetting($walletIds: [WalletId!]!) {
    me {
      id
      defaultAccount {
        id
        csvTransactions(walletIds: $walletIds)
      }
    }
  }
`

export const ExportCsvSetting: React.FC = () => {
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()
  const { data, loading } = useSettingsScreenQuery()

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)
  const btcWalletId = btcWallet?.id
  const usdWalletId = usdWallet?.id

  const [fetchCsvTransactionsQuery, { loading: spinner }] =
    useWalletCsvTransactionsLazyQuery({
      fetchPolicy: "network-only",
    })

  const fetchCsvTransactions = async () => {
    const walletIds: string[] = []
    // if (btcWalletId) walletIds.push(btcWalletId)
    if (usdWalletId) walletIds.push(usdWalletId)

    const { data } = await fetchCsvTransactionsQuery({
      variables: { walletIds },
    })

    const csvEncoded = data?.me?.defaultAccount?.csvTransactions
    try {
      await Share.open({
        title: "flash-transactions",
        filename: "flash-transactions",
        url: `data:text/comma-separated-values;base64,${csvEncoded}`,
        type: "text/comma-separated-values",
      })
    } catch (err: unknown) {
      if (err instanceof Error) {
        crashlytics().recordError(err)
      }
      console.error(err)
    }
  }

  return (
    <SettingsRow
      loading={loading}
      spinner={spinner}
      title={LL.common.csvExport()}
      leftIcon="download-outline"
      rightIcon={null}
      action={fetchCsvTransactions}
    />
  )
}
