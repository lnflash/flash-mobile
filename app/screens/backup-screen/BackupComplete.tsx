import React from "react"
import styled from "styled-components/native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { StackScreenProps } from "@react-navigation/stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useTheme } from "@rneui/themed"

// assets
import CircleCheck from "@app/assets/icons/circleCheck.png"

// store
import { usePersistentStateContext } from "@app/store/persistent-state"

type Props = StackScreenProps<RootStackParamList, "BackupComplete">

const BackupComplete: React.FC<Props> = ({ navigation }) => {
  const bottom = useSafeAreaInsets().bottom
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const { updateState } = usePersistentStateContext()

  const onContinue = () => {
    updateState((state: any) => {
      if (state)
        return {
          ...state,
          backupBtcWallet: true,
        }
      return undefined
    })
    navigation.navigate("BackupOptions")
  }

  return (
    <Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <Image source={CircleCheck} />
        <Title style={{ color: colors.black }}>{LL.BackupComplete.title()}</Title>
        <Description>{LL.BackupComplete.description()}</Description>
      </Container>
      <Btn bottom={bottom} onPress={onContinue}>
        <BtnTitle style={{ color: colors.white }}>
          {LL.BackupComplete.complete()}
        </BtnTitle>
      </Btn>
    </Wrapper>
  )
}

export default BackupComplete

const Wrapper = styled.View`
  flex: 1;
  justify-content: space-between;
  padding-horizontal: 20px;
`

const Container = styled.View`
  align-items: center;
`

const Image = styled.Image`
  height: 60px;
  width: 60px;
  margin-top: 10px;
  margin-bottom: 25px;
`

const Title = styled.Text`
  font-size: 21px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 10px;
`

const Description = styled.Text`
  font-size: 18px;
  font-weight: 400;
  color: #777;
  text-align: center;
`

const Btn = styled.TouchableOpacity<{ bottom: number }>`
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background-color: #60aa55;
  margin-bottom: ${({ bottom }) => bottom || 10}px;
  padding-vertical: 14px;
`

const BtnTitle = styled.Text`
  font-size: 18px;
  font-weight: 600;
`
