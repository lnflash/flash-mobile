import React, { useEffect, useState } from "react"
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  AppState,
} from "react-native"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { makeStyles } from "@rneui/themed"
import { Screen } from "@app/components/screen"
import { useNavigation } from "@react-navigation/native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackNavigationProp } from "@react-navigation/stack"

type MigrationState = "checking" | "transferring" | "completed" | "skipped" | "error"

type MigrationResult = {
  status: "completed" | "skipped" | "error"
  message: string
}

// Placeholder for migration function - will be imported from migration.ts when available
const checkAndMigrate = async (
  persistentState: any,
  updateState: (update: (state: any) => any) => void,
): Promise<MigrationResult> => {
  // This will be replaced with actual import when migration.ts is created
  return { status: "skipped", message: "No funds to transfer" }
}

export const SparkMigrationScreen: React.FC = () => {
  const { persistentState, updateState } = usePersistentStateContext()
  const [migrationState, setMigrationState] = useState<MigrationState>("checking")
  const [errorMessage, setErrorMessage] = useState<string>("")
  const styles = useStyles()
  const navigation =
    useNavigation<StackNavigationProp<RootStackParamList, "SparkMigration">>()

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange)

    return () => {
      appStateSubscription.remove()
    }
  }, [])

  const handleAppStateChange = (state: string) => {
    if (state === "active") {
      // App has come to foreground - migration helper is idempotent
      // so it's safe to continue or retry
    }
  }

  useEffect(() => {
    const runMigration = async () => {
      // Skip migration if not in advance mode (no BTC wallet)
      if (!persistentState.isAdvanceMode) {
        setMigrationState("skipped")
        // Navigate after delay
        setTimeout(() => {
          navigation.reset({
            index: 0,
            routes: [{ name: "Primary" }],
          })
        }, 2000)
        return
      }

      try {
        setMigrationState("checking")
        const result = await checkAndMigrate(persistentState, updateState)

        if (result.status === "error") {
          setMigrationState("error")
          setErrorMessage(result.message)
        } else if (result.status === "completed") {
          setMigrationState("completed")
          // Navigate after delay
          setTimeout(() => {
            navigation.reset({
              index: 0,
              routes: [{ name: "Primary" }],
            })
          }, 2000)
        } else if (result.status === "skipped") {
          setMigrationState("skipped")
          // Navigate after delay
          setTimeout(() => {
            navigation.reset({
              index: 0,
              routes: [{ name: "Primary" }],
            })
          }, 2000)
        }
      } catch (error) {
        setMigrationState("error")
        setErrorMessage(error instanceof Error ? error.message : "Unknown error occurred")
      }
    }

    runMigration()
  }, [persistentState, updateState, navigation])

  const handleRetry = async () => {
    setMigrationState("checking")
    setErrorMessage("")

    try {
      const result = await checkAndMigrate(persistentState, updateState)

      if (result.status === "error") {
        setMigrationState("error")
        setErrorMessage(result.message)
      } else if (result.status === "completed") {
        setMigrationState("completed")
        setTimeout(() => {
          navigation.reset({
            index: 0,
            routes: [{ name: "Primary" }],
          })
        }, 2000)
      } else if (result.status === "skipped") {
        setMigrationState("skipped")
        setTimeout(() => {
          navigation.reset({
            index: 0,
            routes: [{ name: "Primary" }],
          })
        }, 2000)
      }
    } catch (error) {
      setMigrationState("error")
      setErrorMessage(error instanceof Error ? error.message : "Unknown error occurred")
    }
  }

  const getStatusText = (): string => {
    switch (migrationState) {
      case "checking":
        return "Checking balance..."
      case "transferring":
        return "Transferring funds to new wallet..."
      case "completed":
        return "Migration complete!"
      case "skipped":
        return "No funds to transfer"
      case "error":
        return "Migration failed"
      default:
        return ""
    }
  }

  const isActiveState = migrationState === "checking" || migrationState === "transferring"

  return (
    <Screen preset="scroll" style={styles.screenStyle}>
      <View style={styles.container}>
        {isActiveState && (
          <View style={styles.indicatorContainer}>
            <ActivityIndicator size="large" color="#000" />
          </View>
        )}

        <Text style={styles.statusText}>{getStatusText()}</Text>

        {migrationState === "error" && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    flexGrow: 1,
    padding: 20,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  indicatorContainer: {
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    textAlign: "center",
    marginVertical: 20,
    color: colors.black,
  },
  errorContainer: {
    marginTop: 20,
    alignItems: "center",
  },
  errorMessage: {
    fontSize: 14,
    color: colors.error,
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "600",
  },
}))
