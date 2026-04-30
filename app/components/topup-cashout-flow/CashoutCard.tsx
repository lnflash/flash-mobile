import React from "react"
import { View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"

type Props = {
  title: string
  detail?: string | number
}

const CashoutCard: React.FC<Props> = ({ title, detail }) => {
  const styles = useStyles()

  return (
    <View>
      <Text type="bl" bold>
        {title}
      </Text>
      <View style={styles.card}>
        <Text type="bl">{detail}</Text>
      </View>
    </View>
  )
}

export default CashoutCard

const useStyles = makeStyles(({ colors }) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    marginTop: 5,
    marginBottom: 15,
    padding: 15,
    backgroundColor: colors.grey5,
  },
}))
