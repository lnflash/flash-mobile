import React from "react"
import styled from "styled-components/native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { StackScreenProps } from "@react-navigation/stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

type Props = StackScreenProps<RootStackParamList, "BackupStart">

const BackupStart: React.FC<Props> = ({ navigation }) => {
  const { LL } = useI18nContext()
  const bottom = useSafeAreaInsets().bottom

  const onContinue = () => {
    navigation.navigate("BackupSeedPhrase")
  }

  return (
    <Wrapper>
      <Container>
        <Title>{LL.BackupStart.title()}</Title>
        <Description>{LL.BackupStart.description()}</Description>
      </Container>
      <Btn bottom={bottom} onPress={onContinue}>
        <BtnTitle>{LL.BackupStart.continue()}</BtnTitle>
      </Btn>
    </Wrapper>
  )
}

export default BackupStart

const Wrapper = styled.View`
  flex: 1;
  background-color: #fff;
  justify-content: space-between;
  padding-horizontal: 20px;
`

const Container = styled.View``

const Title = styled.Text`
  font-size: 21px;
  font-weight: 600;
  color: #000;
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
  background-color: #f7931a;
  margin-bottom: ${({ bottom }) => bottom}px;
  padding-vertical: 14px;
`

const BtnTitle = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: #fff;
`