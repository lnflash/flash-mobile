import React from "react"
import styled from "styled-components/native"
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

// components
import { IconBtn } from "../buttons"

type Props = {
  setModalVisible: (val: boolean) => void
  setDefaultAccountModalVisible: (val: boolean) => void
}

const Buttons: React.FC<Props> = ({ setModalVisible, setDefaultAccountModalVisible }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()

  const { LL } = useI18nContext()
  const { currentLevel } = useLevel()
  const { persistentState } = usePersistentStateContext()
  const { data } = useHasPromptedSetDefaultAccountQuery()

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

  const buttons = [
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
    {
      title: LL.HomeScreen.transfer(),
      target: "transfer",
      icon: "swap",
    },
  ]

  if (persistentState.isAdvanceMode) {
    buttons.push({
      title: LL.ConversionDetailsScreen.title(),
      target: "conversionDetails",
      icon: "swap",
    })
  }

  // if (currentLevel === AccountLevel.Two) {
  //   buttons.push({
  //     title: LL.Cashout.title(),
  //     target: "CashoutDetails",
  //     icon: "dollar",
  //   })
  // }

  return (
    <Wrapper>
      {buttons.map((item) => (
        <IconBtn
          key={item.title}
          type="clear"
          icon={item.icon as any}
          label={item.title}
          onPress={() => onMenuClick(item.target)}
        />
      ))}
    </Wrapper>
  )
}

export default Buttons

const Wrapper = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
`
