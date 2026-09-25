import { useThemeMode } from "@rneui/themed"
import * as React from "react"
import { StatusBar } from "react-native"

/**
 * Status-bar icon tint, taken from the active theme.
 *
 * Android 15+ enforces edge-to-edge and ignores StatusBar.setBackgroundColor,
 * so the black band this used to paint never rendered and the app's own
 * content sat behind the bar instead. The tint stayed hard-coded to
 * "light-content", which put white icons on white screens (ENG-609). The tint
 * is a separate API and still works, so drive it from the theme: dark icons on
 * the light theme, light icons on the dark theme. The same reasoning applies on
 * iOS, where leaving barStyle undefined gave dark icons in dark mode.
 *
 * Screens that own a dark header (FeaturedProfileView, NIP17Chat) push their
 * own StatusBar entry. React Native merges the mounted stack and the last
 * defined value wins per prop, so those overrides keep working and NIP17Chat,
 * which sets no barStyle, still inherits this one.
 *
 * Must be rendered inside ThemeProvider — it reads the theme mode.
 */
export const ThemedStatusBar: React.FC = () => {
  const { mode } = useThemeMode()

  return <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />
}
