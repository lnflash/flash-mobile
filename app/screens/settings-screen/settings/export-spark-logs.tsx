import { useState } from "react"
import { Platform } from "react-native"
import Share from "react-native-share"
import RNFS from "react-native-fs"
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
      // The current file and, after a rotation, the previous generation too.
      const paths = await getLogFilePaths()
      if (!(await RNFS.exists(paths[0]))) {
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
