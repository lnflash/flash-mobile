import { useState } from "react"
import { Platform } from "react-native"
import Share from "react-native-share"
import RNFS from "react-native-fs"
import { getCrashlytics } from "@react-native-firebase/crashlytics"
import { getLogFilePath } from "@app/utils/breez-sdk/log-buffer"
import { useI18nContext } from "@app/i18n/i18n-react"

import { SettingsRow } from "../row"

export const ExportSparkLogsSetting: React.FC = () => {
  const { LL } = useI18nContext()
  const [spinner, setSpinner] = useState(false)

  const exportLogs = async () => {
    setSpinner(true)
    try {
      const filePath = getLogFilePath()
      const exists = await RNFS.exists(filePath)

      if (!exists) {
        console.warn("No log file found")
        return
      }

      const fileUrl = Platform.OS === "ios" ? filePath : `file://${filePath}`
      await Share.open({
        title: "flash-spark-debug-logs",
        url: fileUrl,
        type: "text/csv",
        failOnCancel: false,
      })
    } catch (err: unknown) {
      if (err instanceof Error) {
        getCrashlytics().recordError(err)
      }
      console.error(err)
    } finally {
      setSpinner(false)
    }
  }

  return (
    <SettingsRow
      spinner={spinner}
      title={LL.common.exportSparkLogs()}
      leftIcon="bug-outline"
      rightIcon={null}
      action={exportLogs}
    />
  )
}
