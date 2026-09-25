import { ViewStyle } from "react-native"
import { KeyboardOffsets, ScreenPresets } from "./screen.presets"

export interface ScreenProps {
  /**
   * Children components.
   */
  children?: React.ReactNode

  /**
   * An optional style override useful for padding & margin.
   */
  style?: ViewStyle

  /**
   * One of the different types of presets.
   */
  preset?: ScreenPresets

  /**
   * An optional background color
   */
  backgroundColor?: string

  /**
   * An optional status-bar icon tint for this screen.
   *
   * Defaults to the theme tint (dark icons on light, light icons on dark) set
   * app-wide by ThemedStatusBar — see app/components/themed-status-bar.tsx.
   * Set it only when the screen paints its own full-bleed field under the
   * status bar (a camera view, a coloured success screen), where the theme
   * tint would be the wrong one. The band itself is painted with
   * `backgroundColor`, which matters on Android <= 14 where the window still
   * draws a real, opaque band.
   */
  statusBar?: "light-content" | "dark-content"

  /**
   * Should we not wrap in SafeAreaView? Defaults to false.
   */
  unsafe?: boolean

  /**
   * By how much should we offset the keyboard? Defaults to none.
   */
  keyboardOffset?: KeyboardOffsets

  keyboardShouldPersistTaps?: "always" | "never" | "handled"
}
