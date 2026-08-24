import { Linking } from "react-native"

export const openWhatsAppUrl: (url: string) => Promise<void> = async (url: string) =>
  Linking.openURL(url)
