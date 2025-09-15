import React from "react"
import { View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import moment from "moment"

// assets
import Event from "@app/assets/illustrations/event.svg"
import Reward from "@app/assets/illustrations/reward.svg"
import Discount from "@app/assets/illustrations/discount.svg"

type Props = {
  title: string
  description: string
  starts: number
  ends: number
  type: "event" | "reward" | "discount"
}

const Favorites: React.FC<Props> = ({ title, description, starts, ends, type }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const date = `${moment(new Date(starts)).format("MMM Do")} ~ ${moment(
    new Date(ends),
  ).format("MMM Do")}`
  const time = new Date().getTime()
  const status = time > ends ? "expired" : time < starts ? "coming" : "active"

  const Image = type === "event" ? Event : type === "reward" ? Reward : Discount
  return (
    <View style={styles.wrapper}>
      <Image width={100} height={100} />
      <View style={styles.details}>
        <View style={styles.header}>
          <Text type="p4" color={colors.grey1}>
            {date}
          </Text>
          <View style={[styles.status, styles[status]]}>
            <Text type="caption" color={colors.white}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </View>
        </View>
        <Text type="p1" bold>
          {title}
        </Text>
        <Text type="p3" numberOfLines={3} color={colors.grey1}>
          {description}
        </Text>
      </View>
    </View>
  )
}

export default Favorites

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    marginVertical: 10,
    padding: 10,
    borderColor: colors.grey3,
    backgroundColor: colors.background,
  },
  details: {
    flex: 1,
    marginLeft: 10,
    gap: 5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  status: {
    backgroundColor: "green",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  expired: {
    backgroundColor: "gray",
  },
  active: {
    backgroundColor: "green",
  },
  coming: {
    backgroundColor: "blue",
  },
}))
