import { useState } from "react"
import { Platform } from "react-native"
import Share from "react-native-share"
import { getCrashlytics } from "@react-native-firebase/crashlytics"
import { getLogFilePaths } from "@app/utils/breez-sdk/log-buffer"
import { useI18nContext } from "@app/i18n/i18n-react"

import { SettingsRow } from "../row"

export const ExportSparkLogsSetting: React.FC = () => {
  const { LL } = useI18nContext()
  const [spinner, setSpinner] = useState(false)

  const exportLogs = async () => {
    setSpinner(true)
    try {
      // The log files that exist: the current one and, after a rotation, the
      // previous generation (alone, if a rotation failed to start a fresh file).
      const paths = await getLogFilePaths()
      if (paths.length === 0) {
        console.warn("No log file found")
        return
      }
      const urls = paths.map((p) => (Platform.OS === "ios" ? p : `file://${p}`))
      await Share.open({
        title: "flash-spark-debug-logs",
        ...(urls.length === 1 ? { url: urls[0] } : { urls }),
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
