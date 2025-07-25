import type { FormattersInitializer } from "typesafe-i18n"
import type { Locales, Formatters } from "./i18n-types"

export const initFormatters: FormattersInitializer<Locales, Formatters> = (
  _locale: Locales,
) => {
  const formatters: Formatters = {
    sats: (value: unknown): unknown => {
      if (value === 0) {
        return `₿${value.toPrecision(1)}`
      }
      else if (value instanceof Number) {
        return `₿${value.toPrecision(1)}`
      } 
      return `₿${value}`
    },
  }
  return formatters
}
