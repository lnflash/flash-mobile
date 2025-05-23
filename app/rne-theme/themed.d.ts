import "@rneui/themed"

declare module "@rneui/themed" {
  export interface Colors {
    red: string
    green: string
    transparent: string

    // _ are meant to be static across light and dark
    // either because they are used in screen that require no inversion
    // like for the QR code, or camera view
    // or because they are used in the earn section which is not dark/light mode aware

    _white: string
    _black: string
    _lightGrey: string
    _lighterGrey: string
    _lightBlue: string
    _borderBlue: string
    _lighterBlue: string
    _darkGrey: string
    _blue: string
    _orange: string
    _sky: string
    _gold: string

    primary3: string
    primary4: string
    primary5: string
    error9: string

    warning9: string

    blue5: string

    loaderForeground: string
    loaderBackground: string

    accent01: string
    accent02: string
    border01: string
    border02: string
    background: string
    layer: string
    text01: string
    text02: string
    textInverse: string
    textPlaceholder: string
    placeholder: string
    icon01: string
    icon02: string
    iconInverse: string
    button01: string
    button02: string
    buttonInverse: string
    tabActive: string
    tabInactive: string
  }

  export interface TextProps {
    bold?: boolean
    type?:
      | "p1"
      | "p2"
      | "p3"
      | "p4"
      | "h1"
      | "h2"
      | "caption"
      | "bm"
      | "bl"
      | "h01"
      | "h02"
      | "h03"
      | "h04"
      | "h05"
      | "h06"
    color?: string
  }

  export interface ComponentTheme {
    Text: Partial<TextProps>
  }
}
