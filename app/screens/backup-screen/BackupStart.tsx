import React from "react"
import styled from "styled-components/native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { StackScreenProps } from "@react-navigation/stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { Text, useTheme } from "@rneui/themed"

// components
import { PrimaryBtn } from "@app/components/buttons"

type Props = StackScreenProps<RootStackParamList, "BackupStart">

const BackupStart: React.FC<Props> = ({ navigation }) => {
  const bottom = useSafeAreaInsets().bottom
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()

  const onContinue = () => {
    navigation.navigate("BackupSeedPhrase")
  }

  return (
    <Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <Text type="h01" bold style={{ textAlign: "center" }}>
          {LL.BackupStart.title()}
        </Text>
        <Text type="p1" color={colors.grey2} style={{ textAlign: "center" }}>
          {LL.BackupStart.description()}
        </Text>
      </Container>
      <PrimaryBtn
        label={LL.BackupStart.continue()}
        onPress={onContinue}
        btnStyle={{ marginBottom: bottom || 10 }}
      />
    </Wrapper>
  )
}

export default BackupStart

const Wrapper = styled.View`
  flex: 1;
  justify-content: space-between;
  padding-horizontal: 20px;
`

const Container = styled.View`
  row-gap: 10px;
`
