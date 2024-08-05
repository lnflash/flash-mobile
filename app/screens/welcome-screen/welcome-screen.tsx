/* eslint-disable react-native/no-color-literals */
/* eslint-disable react-native/no-unused-styles */
import { StackNavigationProp } from "@react-navigation/stack"
import * as React from "react"
import { Dimensions, TouchableOpacity, View } from "react-native"
import Swiper from "react-native-swiper"
import { Screen } from "../../components/screen"
import type { RootStackParamList } from "../../navigation/stack-param-lists"
import { makeStyles, Image } from "@rneui/themed"

type Props = {
  navigation: StackNavigationProp<RootStackParamList, "welcomeFirst">
}

const { width, height } = Dimensions.get("window")

const useStyles = makeStyles(({ colors }) => ({
  flex: {
    flex: 1,
  },
  cover: {
    width: "100%",
    height: "100%",
    resizeMode: height < 560 ? "stretch" : "cover",
    // if the height is less than 545, then compress the image
    // if the height is greater than 545, then stretch the image
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 5,
  },
  container: {
    flex: 1,
  },
  buttonContainer: {
    position: "absolute",
    bottom: 50,
    width: "100%",
    alignItems: "center",
  },
  touchableArea: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: "12%", // Adjust the height as needed to define the interactive area
    // borderColor: colors.red, // For debugging
    // borderWidth: 1, // For debugging
  },
  touchableAreaSkip: {
    position: "absolute",
    top: 0,
    right: 0,
    width: "25%",
    height: "10%", // Adjust the height as needed to define the interactive area
    // borderColor: colors.red, // For debugging
    // borderWidth: 1, // For debugging
  },
}))

export const WelcomeFirstScreen: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const swiperRef = React.useRef<Swiper | null>(null)

  const handlePress = (index: number) => {
    if (index < 2) {
      swiperRef.current?.scrollBy(1)
    } else {
      navigation.navigate("Primary")
    }
  }

  return (
    <Swiper
      ref={swiperRef}
      loop={false}
      showsPagination={false}
      index={0}
      autoplay={false}
      scrollEnabled={true}
    >
      <Screen statusBar="light-content">
        <View style={styles.container}>
          <Image
            source={require("@app/assets/images/welcome-1.png")}
            style={styles.cover}
          />
          <TouchableOpacity
            style={styles.touchableAreaSkip}
            onPress={() => handlePress(2)}
          />
          <TouchableOpacity style={styles.touchableArea} onPress={() => handlePress(0)} />
        </View>
      </Screen>
      <Screen>
        <View style={styles.container}>
          <Image
            source={require("@app/assets/images/welcome-2.png")}
            style={styles.cover}
          />
          <TouchableOpacity
            style={styles.touchableAreaSkip}
            onPress={() => handlePress(2)}
          />
          <TouchableOpacity style={styles.touchableArea} onPress={() => handlePress(1)} />
        </View>
      </Screen>
      <Screen statusBar="light-content">
        <View style={styles.container}>
          <Image
            source={require("@app/assets/images/welcome-3.png")}
            style={styles.cover}
          />
          <TouchableOpacity
            style={styles.touchableAreaSkip}
            onPress={() => handlePress(2)}
          />
          <TouchableOpacity style={styles.touchableArea} onPress={() => handlePress(2)} />
        </View>
      </Screen>
    </Swiper>
  )
}
