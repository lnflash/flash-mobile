import { Alert, Platform } from "react-native"
import Share from "react-native-share"
import RNFS from "react-native-fs"

import { gql } from "@apollo/client"
import {
  useSettingsScreenQuery,
  useWalletCsvTransactionsLazyQuery,
} from "@app/graphql/generated"
import { getCashWallet } from "@app/graphql/wallets-utils"
import { useI18nContext } from "@app/i18n/i18n-react"
import { getCrashlytics } from "@react-native-firebase/crashlytics"

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

  const usdWallet = getCashWallet(data?.me?.defaultAccount?.wallets)
  const btcWalletId = btcWallet?.id
  const usdWalletId = usdWallet?.id

  const [fetchCsvTransactionsQuery, { loading: spinner }] =
    useWalletCsvTransactionsLazyQuery({
      fetchPolicy: "network-only",
    })

  const shareCsvFile = async (filePath: string) => {
    try {
      let shareUrl = filePath
      if (Platform.OS === "android") {
        const cachePath = `${RNFS.CachesDirectoryPath}/flash-transactions.csv`
        await RNFS.copyFile(filePath, cachePath)
        shareUrl = `file://${cachePath}`
      }
      await Share.open({
        title: "flash-transactions",
        url: shareUrl,
        type: "text/csv",
        failOnCancel: false,
      })
    } catch (err: unknown) {
      if (err instanceof Error) {
        getCrashlytics().recordError(err)
      }
      console.error(err)
    }
  }

  const fetchCsvTransactions = async () => {
    const walletIds: string[] = []
    // if (btcWalletId) walletIds.push(btcWalletId)
    if (usdWalletId) walletIds.push(usdWalletId)

    const { data } = await fetchCsvTransactionsQuery({
      variables: { walletIds },
    })

    const csvEncoded = data?.me?.defaultAccount?.csvTransactions
    if (!csvEncoded) return

    try {
      if (Platform.OS === "ios") {
        // iOS: share directly via base64 data URI so the file appears in the share sheet
        await Share.open({
          title: "flash-transactions",
          filename: "flash-transactions",
          url: `data:text/comma-separated-values;base64,${csvEncoded}`,
          type: "text/comma-separated-values",
          failOnCancel: false,
        })
      } else {
        // Android: save to Downloads, then offer Share button
        const csvContent = atob(csvEncoded)
        const filePath = `${RNFS.DownloadDirectoryPath}/flash-transactions.csv`
        await RNFS.writeFile(filePath, csvContent, "utf8")

        Alert.alert("CSV Exported", `Saved to Downloads/flash-transactions.csv`, [
          {
            text: "Share",
            onPress: () => shareCsvFile(filePath),
          },
          { text: "OK", style: "cancel" },
        ])
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        getCrashlytics().recordError(err)
      }
      console.error(err)
      Alert.alert("Error", "Failed to export CSV")
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
