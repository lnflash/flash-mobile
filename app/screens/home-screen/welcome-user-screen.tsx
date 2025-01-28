import React, { useEffect, useRef } from "react"
import { View, Text, StyleSheet, Animated } from "react-native"

interface WelcomeUserScreenProps {
  username: string
  onComplete: () => void
}

const WelcomeUserScreen: React.FC<WelcomeUserScreenProps> = ({
  username,
  onComplete,
}) => {
  const translateY = useRef(new Animated.Value(0)).current // Initial vertical position

  useEffect(() => {
    // Create jumping animation
    const jumping = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -20, // Move up by 20 units
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0, // Move back to the original position
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    )

    // Start the animation
    jumping.start()

    // Automatically navigate after a timeout (e.g., 3 seconds)
    const timeout = setTimeout(() => {
      onComplete() // Trigger navigation or complete callback
    }, 3000)

    // Cleanup timeout and stop animation
    return () => {
      clearTimeout(timeout)
      jumping.stop()
    }
  }, [translateY, onComplete])

  return (
    <View style={styles.container}>
      <Animated.Text style={[styles.title, { transform: [{ translateY }] }]}>
        Welcome, {username}!
      </Animated.Text>
      <Text style={styles.subtitle}>We're excited to have you here 🚀</Text>
    </View>
  )
}

export default WelcomeUserScreen

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#4CAF50", // Splash screen background color
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: "#fff",
  },
})
