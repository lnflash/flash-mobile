import React from "react"
import { View, Text, StyleSheet } from "react-native"

type BadgeProps = {
  count: number
}

const NotificationBadge: React.FC<BadgeProps> = ({ count }) => {
  if (count <= 0) return null // Do not render if there are no notifications

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{count}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: -10,
    top: -5,
    backgroundColor: "green",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "white",
    fontWeight: "bold",
    fontSize: 12,
  },
})

export default NotificationBadge
