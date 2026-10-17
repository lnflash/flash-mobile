import React from "react"
import { StyleSheet, View } from "react-native"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// hooks
import {
  AccountLevel,
  useHasPromptedSetDefaultAccountQuery,
} from "@app/graphql/generated"
import { useLevel } from "@app/graphql/level-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useTransferFlags } from "@app/hooks"
import { useFeatureFlags } from "@app/config/feature-flags-context"

// components
import { IconBtn } from "../buttons"

type Props = {
  setModalVisible: (val: boolean) => void
  setDefaultAccountModalVisible: (val: boolean) => void
}

/** The most buttons the row holds at IconBtn's own spacing. */
const ROOMY_BUTTONS = 4

const Buttons: React.FC<Props> = ({ setModalVisible, setDefaultAccountModalVisible }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()

  const { LL } = useI18nContext()
  const { currentLevel } = useLevel()
  const { persistentState } = usePersistentStateContext()
  const { data } = useHasPromptedSetDefaultAccountQuery()
  const { transferEnabled } = useTransferFlags()
  const { assistantEnabled } = useFeatureFlags()

  const onMenuClick = (target: string) => {
    if (!isAuthed) {
      setModalVisible(true)
    } else {
      if (
        target === "receiveBitcoin" &&
        !data?.hasPromptedSetDefaultAccount &&
        persistentState.isAdvanceMode
      ) {
        setDefaultAccountModalVisible(true)
      } else {
        navigation.navigate(target as any)
      }
    }
  }

  const buttons: { title: string; target: string; icon: string; testID?: string }[] = [
    {
      title: LL.HomeScreen.send(),
      target: "sendBitcoinDestination",
      icon: "up",
    },
    {
      title: LL.HomeScreen.receive(),
      target: "receiveBitcoin",
      icon: "down",
    },
  ]

  if (persistentState.isAdvanceMode) {
    buttons.push({
      title: LL.ConversionDetailsScreen.title(),
      target: "conversionDetails",
      icon: "swap",
    })
  }

  if (currentLevel !== AccountLevel.Zero && transferEnabled) {
    buttons.push({
      title: LL.HomeScreen.transfer(),
      target: "TopupCashout",
      icon: "upDown",
    })
  }

  // The assistant's thread (ENG-689), only while Remote Config turns it on.
  if (assistantEnabled) {
    buttons.push({
      title: LL.HomeScreen.askFlash(),
      target: "askFlash",
      icon: "askFlash",
      testID: "home-ask-flash",
    })
  }

  // Each button is at least 96pt wide (IconBtn: a 64pt circle, 8pt of
  // padding and 8pt of margin a side), so four fill a phone's row and a
  // fifth (advanced mode, transfer and Ask Flash together) would run past
  // its edges. Past four, each button takes an equal share of the row, its
  // label wrapping under it, so five fit on any screen 336pt wide or more
  // (five 64pt circles and the row's 8pt a side). That row wraps too, so a
  // narrower one never clips a button either. Four or fewer keep IconBtn's
  // own spacing, as before.
  const compact = buttons.length > ROOMY_BUTTONS

  return (
    <View style={compact ? styles.compactRow : styles.row} testID="home-buttons">
      {buttons.map((item) => (
        <IconBtn
          key={item.title}
          type="clear"
          icon={item.icon as any}
          label={item.title}
          onPress={() => onMenuClick(item.target)}
          testID={item.testID}
          style={compact ? styles.compactButton : undefined}
        />
      ))}
    </View>
  )
}

export default Buttons

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  compactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8,
    // A label that wraps makes its button taller: the circles stay in line.
    alignItems: "flex-start",
    justifyContent: "center",
    marginTop: 20,
    paddingHorizontal: 8,
  },
  compactButton: {
    flex: 1,
    minWidth: 64,
    maxWidth: 96,
    paddingHorizontal: 0,
    marginHorizontal: 0,
  },
})
