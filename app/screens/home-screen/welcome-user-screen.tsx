import React, { useEffect, useRef } from "react"
import { View, Text, StyleSheet, Animated, Modal } from "react-native"
import LinearGradient from "react-native-linear-gradient" // Install with `npm install react-native-linear-gradient`

interface WelcomeUserScreenProps {
  username: string
  visible: boolean
  onComplete: () => void
}

const WelcomeUserScreen: React.FC<WelcomeUserScreenProps> = ({
  username,
  visible,
  onComplete,
}) => {
  const translateY = useRef(new Animated.Value(0)).current
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.loop(
        Animated.sequence([
          Animated.spring(translateY, {
            toValue: -20,
            friction: 2,
            tension: 100,
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            friction: 2,
            tension: 100,
            useNativeDriver: true,
          }),
        ]),
      ).start()

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      }).start()

      const timeout = setTimeout(() => {
        onComplete()
      }, 3000)

      return () => clearTimeout(timeout)
    }
  }, [visible, translateY, fadeAnim, onComplete])

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <LinearGradient colors={["#6A11CB", "#2575FC"]} style={styles.container}>
        <Animated.View
          style={[
            styles.bouncingText,
            { transform: [{ translateY }], opacity: fadeAnim },
          ]}
        >
          <Text style={styles.title}>Welcome, {username}!</Text>
        </Animated.View>
        <Animated.Text style={[styles.subtitle, { opacity: fadeAnim }]}>
          Let’s get started 🚀
        </Animated.Text>
      </LinearGradient>
    </Modal>
  )
}

export default WelcomeUserScreen

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#4CAF50",
  },
  bouncingText: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: {
    fontSize: 18,
    color: "#fff",
    marginTop: 20,
    opacity: 0.8,
  },
})
