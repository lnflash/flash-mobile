declare module "react-native-indicators" {
  import type { ComponentType } from "react"
  import type { StyleProp, ViewStyle } from "react-native"

  export interface BaseIndicatorProps {
    animationDuration?: number
    animating?: boolean
    color?: string
    count?: number
    hidesWhenStopped?: boolean
    interaction?: boolean
    size?: number
    style?: StyleProp<ViewStyle>
  }

  export const BallIndicator: ComponentType<BaseIndicatorProps>
  export const BarIndicator: ComponentType<BaseIndicatorProps>
}
