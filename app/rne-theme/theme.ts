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
              lineHeight: 32,
              fontWeight: props.bold ? "600" : "400",
            },
            h2: {
              fontSize: 20,
              lineHeight: 24,
              fontWeight: props.bold ? "600" : "400",
            },
            p1: {
              fontSize: 18,
              lineHeight: 24,
              fontWeight: props.bold ? "600" : "400",
            },
            p2: {
              fontSize: 16,
              lineHeight: 24,
              fontWeight: props.bold ? "600" : "400",
            },
            p3: {
              fontSize: 14,
              lineHeight: 18,
              fontWeight: props.bold ? "600" : "400",
            },
            p4: {
              fontSize: 12,
              lineHeight: 18,
              fontWeight: props.bold ? "600" : "400",
            },
            caption: {
              fontSize: 13,
              lineHeight: 16.38,
              fontWeight: props.bold ? "600" : "400",
            },
            bm: {
              fontSize: 14,
              lineHeight: 17.64,
              fontWeight: props.bold ? "600" : "400",
            },
            bl: {
              fontSize: 16,
              lineHeight: 20.16,
              fontWeight: props.bold ? "600" : "400",
            },
            h01: {
              fontSize: 20,
              lineHeight: 25.2,
              fontWeight: props.bold ? "600" : "400",
            },
            h02: {
              fontSize: 24,
              lineHeight: 30.24,
              fontWeight: props.bold ? "600" : "400",
            },
            h03: {
              fontSize: 40,
              lineHeight: 50.4,
              fontWeight: props.bold ? "600" : "400",
            },
            h04: {
              fontSize: 56,
              lineHeight: 70.56,
              fontWeight: props.bold ? "600" : "400",
            },
            h05: {
              fontSize: 72,
              lineHeight: 90.72,
              fontWeight: props.bold ? "600" : "400",
            },
            h06: {
              fontSize: 90,
              lineHeight: 113.4,
              fontWeight: props.bold ? "600" : "400",
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
