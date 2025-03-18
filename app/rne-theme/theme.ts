import { createTheme } from "@rneui/themed"
import { StyleProp, TextStyle } from "react-native"
import { light, dark } from "./colors"

const theme = createTheme({
  lightColors: light,
  darkColors: dark,
  mode: "light",
  components: {
    Button: {
      containerStyle: {
        borderRadius: 50,
      },
      buttonStyle: {
        paddingHorizontal: 32,
        paddingVertical: 8,
        borderRadius: 50,
      },
    },
    Text: (props, { colors }) => {
      const universalStyle = {
        color: props.color || colors.black,
        fontFamily: "Sora",
      }

      const sizeStyle = props.type
        ? {
            h1: {
              fontSize: 24,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            h2: {
              fontSize: 20,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            p1: {
              fontSize: 18,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            p2: {
              fontSize: 16,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            p3: {
              fontSize: 14,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            p4: {
              fontSize: 12,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            caption: {
              fontSize: 13,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            bm: {
              fontSize: 14,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            bl: {
              fontSize: 16,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            h01: {
              fontSize: 20,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            h02: {
              fontSize: 24,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            h03: {
              fontSize: 40,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            h04: {
              fontSize: 56,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            h05: {
              fontSize: 72,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
            h06: {
              fontSize: 90,
              fontWeight: props.bold ? "600" : "400",
              fontFamily: props.bold ? "Sora-Bold" : "Sora-Regular",
            },
          }[props.type]
        : {}

      return {
        style: {
          ...universalStyle,
          ...sizeStyle,
        } as StyleProp<TextStyle>,
      }
    },
  },
})

export default theme
