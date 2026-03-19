import React from "react"
import { View } from "react-native"
import { makeStyles } from "@rneui/themed"

// components
import { AmountInput } from "../amount-input"
import { NoteInput } from "../note-input"

type Props = {
  request: any
}

const AmountNote: React.FC<Props> = ({ request }) => {
  const styles = useStyles()

  if (request.type === "PayCode") return null
  return (
    <View style={styles.container}>
      <AmountInput
        unitOfAccountAmount={request.unitOfAccountAmount}
        setAmount={request.setAmount}
        canSetAmount={request.canSetAmount}
        convertMoneyAmount={request.convertMoneyAmount}
        walletCurrency={request.receivingWalletDescriptor.currency}
        showValuesIfDisabled={false}
        big={false}
        newDesign={true}
      />
      <NoteInput
        onBlur={request.setMemo}
        onChangeText={request.setMemoChangeText}
        value={request.memoChangeText || ""}
        editable={request.canSetMemo}
        style={{ marginTop: 10 }}
        big={false}
        newDesign={true}
      />
    </View>
  )
}

export default AmountNote

const useStyles = makeStyles(({ colors }) => ({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border01,
  },
}))
