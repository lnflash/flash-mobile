import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackNavigationProp } from "@react-navigation/stack"
import { useNavigation } from "@react-navigation/native"
import { AccountLevel, useLevel } from "@app/graphql/level-context"
import { useAccountStatus } from "@app/hooks/use-account-status"
import { useI18nContext } from "@app/i18n/i18n-react"

// components
import { SettingsRow } from "../row"

// ENG-516 light headline status: the account leads with one word —
// Trial → Verified → Business. Pro/International/Merchant are retired.
const headlineLabel = {
  TRIAL: "TRIAL ACCOUNT",
  VERIFIED: "VERIFIED ACCOUNT",
  BUSINESS: "BUSINESS ACCOUNT",
}

export const AccountLevelSetting: React.FC = () => {
  const { currentLevel } = useLevel()
  const { statusHeadline } = useAccountStatus()
  const { LL } = useI18nContext()
  const { navigate } = useNavigation<StackNavigationProp<RootStackParamList>>()

  const subtitle =
    currentLevel === AccountLevel.NonAuth
      ? "UNAUTHORIZED ACCOUNT"
      : headlineLabel[statusHeadline]

  return (
    <SettingsRow
      title={LL.common.account()}
      subtitle={subtitle}
      leftIcon="people"
      action={() => {
        navigate("accountScreen")
      }}
    />
  )
}
