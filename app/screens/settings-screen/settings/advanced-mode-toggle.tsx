import { AdvancedModeModal } from "@app/components/advanced-mode-modal"
import { useBitcoinWalletMode } from "@app/hooks/use-bitcoin-wallet-mode"
import { useI18nContext } from "@app/i18n/i18n-react"

import { SettingsRow } from "../row"

export const AdvancedModeToggle: React.FC = () => {
  const { LL } = useI18nContext()
  const mode = useBitcoinWalletMode()
  if (!mode.available) return null

  const title = mode.hasRecoveryPhrase
    ? mode.enabled
      ? LL.SettingsScreen.hideBtcAccount()
      : LL.SettingsScreen.showBtcAccount()
    : mode.enabled
    ? LL.SettingsScreen.beginnerMode()
    : LL.SettingsScreen.advanceMode()

  return (
    <>
      <SettingsRow
        title={title}
        leftIcon={
          mode.hasRecoveryPhrase
            ? mode.enabled
              ? "eye"
              : "eye-off"
            : mode.enabled
            ? "invert-mode-outline"
            : "invert-mode"
        }
        action={() => mode.request(!mode.enabled)}
        rightIcon="sync-outline"
      />
      <AdvancedModeModal
        hasRecoveryPhrase={mode.hasRecoveryPhrase}
        isVisible={mode.setupVisible}
        setIsVisible={mode.setSetupVisible}
      />
    </>
  )
}
