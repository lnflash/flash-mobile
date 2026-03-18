import React from "react"
import { View } from "react-native"
import Modal from "react-native-modal"
import { BallIndicator } from "react-native-indicators"
import { makeStyles, useTheme, Text } from "@rneui/themed"

// components
import { PrimaryBtn } from "../buttons"
import { disconnectLiquidSdk, exportLiquidTxs } from "@app/utils/breez-sdk"

type Props = {
  isVisible: boolean
  loading: boolean
  err?: string
  closeModal: () => void
}

const SparkMigrationModal: React.FC<Props> = ({
  isVisible,
  loading,
  err,
  closeModal,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const onExport = async () => {
    await exportLiquidTxs()
    closeModal()
  }

  return (
    <Modal
      isVisible={isVisible}
      backdropOpacity={0.3}
      backdropColor={colors.grey3}
      onModalHide={disconnectLiquidSdk}
    >
      <View style={styles.card}>
        <Text style={styles.title} type={"h1"}>
          Upgrading Your BTC Wallet
        </Text>
        <Text style={styles.description} type={"p2"}>
          We're migrating your balance to our new, faster wallet. This may take a moment.
          The transfer fee is covered by Flash.
        </Text>
        {!!err && (
          <Text style={styles.err} type={"caption"}>
            {err}
          </Text>
        )}
        {loading ? (
          <BallIndicator
            size={40}
            color={colors.button01}
            style={{ marginVertical: 30 }}
          />
        ) : (
          <View style={{ width: "100%" }}>
            <PrimaryBtn label="Export Liquid Transactions" onPress={onExport} />
            <PrimaryBtn
              type="outline"
              label="Complete"
              btnStyle={{ marginTop: 10 }}
              onPress={closeModal}
            />
          </View>
        )}
      </View>
    </Modal>
  )
}

export default SparkMigrationModal

const useStyles = makeStyles(({ colors }) => ({
  card: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
  },
  title: {
    textAlign: "center",
    marginHorizontal: 20,
  },
  description: {
    textAlign: "center",
    marginVertical: 10,
  },
  err: {
    textAlign: "center",
    color: colors.red,
    marginBottom: 20,
  },
}))
