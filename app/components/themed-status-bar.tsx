import { useTheme, useThemeMode } from "@rneui/themed"
import * as React from "react"
import { StatusBar } from "react-native"

/**
 * Status-bar icon tint and background, taken from the active theme.
 *
 * The tint used to be hard-coded to "light-content" while the background was
 * hard-coded to black. On Android 15+ edge-to-edge is enforced and
 * StatusBar.setBackgroundColor is a no-op for apps targeting SDK 35+, so the
 * black band stopped rendering, the app's own white content showed through, and
 * the white icons went invisible (ENG-609).
 *
 * Both props are therefore driven from the theme rather than dropped: the tint
 * flips with the mode, and the background is painted with the same `colors.white`
 * token `Screen` uses for its own background. That matters because minSdkVersion
 * is 26 (android/build.gradle) and the app theme sets no android:statusBarColor
 * (android/app/src/main/res/values/styles.xml), so on Android 8-14 the window
 * still paints a real, opaque band. With no entry in the StatusBar stack setting
 * a background, RN would fall back to the platform default (#757575 grey) there.
 * Painting `colors.white` keeps the band matching the content underneath on
 * Android <= 14 and reproduces the Android 15+ look. On iOS the prop is ignored,
 * and the barStyle fix also covers iOS dark mode, where leaving barStyle
 * undefined gave dark icons on a dark background.
 *
 * FeaturedProfileView owns a dark header (#0a0a0a) and pushes its own
 * "light-content" entry, so it is unaffected. NIP17Chat is a light-in-light-theme
 * screen that sets only `translucent`/`transparent` and no barStyle; React Native
 * merges the mounted StatusBar stack per prop, so it inherits this barStyle and
 * is fixed by this change rather than exempted from it.
 *
 * Must be rendered inside ThemeProvider — it reads the theme.
 */
export const ThemedStatusBar: React.FC = () => {
  const { theme } = useTheme()
  const { mode } = useThemeMode()

  if (__DEV__ && !theme) {
    // Not a style nit: outside ThemeProvider the rneui context falls back to its
    // default, mode is undefined, and dark-theme users silently get dark icons on
    // a black screen again — exactly the ENG-609 bug, with the unit tests green.
    // eslint-disable-next-line no-console
    console.error(
      "ThemedStatusBar must be rendered inside ThemeProvider — it reads the theme mode (ENG-609).",
    )
  }

  return (
    <StatusBar
      barStyle={mode === "dark" ? "light-content" : "dark-content"}
      backgroundColor={theme?.colors.white}
    />
  )
}
