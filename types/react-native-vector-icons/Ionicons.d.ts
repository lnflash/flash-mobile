declare module "react-native-vector-icons/Ionicons" {
  import type { ComponentType } from "react"
  import type { TextProps } from "react-native"

  export interface IconProps extends TextProps {
    name: string
    size?: number
    color?: string
  }

  const Icon: ComponentType<IconProps>
  export default Icon
}
