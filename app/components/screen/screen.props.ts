import { ViewStyle, RefreshControlProps } from "react-native"
import { KeyboardOffsets, ScreenPresets } from "./screen.presets"
import React from "react"

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
   * An optional status bar setting. Defaults to light-content.
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

  /**
   * How should the keyboard persist when taps are happening
   */
  keyboardShouldPersistTaps?: "always" | "never" | "handled"

  /**
   * RefreshControl component for enabling pull-to-refresh functionality
   */
  refreshControl?: React.ReactElement<RefreshControlProps>
}
