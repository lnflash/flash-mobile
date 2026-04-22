import React, { useEffect, useState } from "react"
import styled from "styled-components/native"
import { FlatList } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import * as Keychain from "react-native-keychain"
import { Text, useTheme, useThemeMode } from "@rneui/themed"

// components
import { PrimaryBtn } from "@app/components/buttons"

type Props = StackScreenProps<RootStackParamList, "BackupSeedPhrase">

const BackupSeedPhrase: React.FC<Props> = ({ navigation }) => {
  const bottom = useSafeAreaInsets().bottom
  const { colors } = useTheme().theme
  const { mode } = useThemeMode()
  const { LL } = useI18nContext()

  const [seedPhrase, setSeedPhrase] = useState<string[]>([])

  useEffect(() => {
    getSeedPhrase()
  }, [])

  const getSeedPhrase = async () => {
    const credentials = await Keychain.getInternetCredentials("mnemonic_key")
    if (credentials) {
      setSeedPhrase(credentials.password.split(" "))
    }
  }

  const onVerify = () => {
    navigation.navigate("BackupDoubleCheck")
  }

  const renderItemHandler = ({ item, index }: { item: string; index: number }) => {
    return (
      <SeedPhrase
        marginRight={index % 2 === 0}
        style={{ backgroundColor: mode === "dark" ? "#5b5b5b" : "#ededed" }}
      >
        <SeedPhraseNum style={{ borderRightColor: colors.white }}>
          <Text type="p1" bold>
            {index + 1}
          </Text>
        </SeedPhraseNum>
        <SeedPhraseText>
          <Text type="p1" bold>
            {item}
          </Text>
        </SeedPhraseText>
      </SeedPhrase>
    )
  }

  return (
    <Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <Text type="h01" bold style={{ textAlign: "center" }}>
          {LL.BackupSeedPhrase.title()}
        </Text>
        <Text type="p1" color={colors.grey2} style={{ textAlign: "center" }}>
          {LL.BackupSeedPhrase.description()}
        </Text>
        <FlatList
          data={seedPhrase}
          numColumns={2}
          renderItem={renderItemHandler}
          columnWrapperStyle={{ justifyContent: "space-between" }}
          scrollEnabled={false}
          style={{ marginTop: 20 }}
        />
      </Container>
      <ButtonsWrapper>
        {/* <Btn isOutline={true} bottom={15} onPress={() => {}}>
          <BtnTitle isOutline={true}>{LL.BackupSeedPhrase.backupToICloud()}</BtnTitle>
        </Btn>
        <Btn isOutline={true} bottom={25} onPress={() => {}}>
          <BtnTitle isOutline={true}>
            {LL.BackupSeedPhrase.backupToGoogleDrive()}
          </BtnTitle>
        </Btn> */}
        <PrimaryBtn
          label={LL.BackupSeedPhrase.verify()}
          onPress={onVerify}
          btnStyle={{ marginBottom: bottom || 10 }}
        />
      </ButtonsWrapper>
    </Wrapper>
  )
}

export default BackupSeedPhrase

const Wrapper = styled.View`
  flex: 1;
  justify-content: space-between;
  padding-horizontal: 20px;
`

const Container = styled.View`
  row-gap: 10px;
`

const SeedPhrase = styled.View<{ marginRight: boolean }>`
  flex: 1;
  flex-direction: row;
  align-items: center;
  border-radius: 20px;
  margin-bottom: 10px;
  margin-right: ${({ marginRight }) => (marginRight ? 15 : 0)}px;
`
const SeedPhraseNum = styled.View`
  width: 50px;
  align-items: center;
  border-right-width: 2px;
  padding-left: 5px;
  padding-vertical: 14px;
`

const SeedPhraseText = styled.View`
  flex: 1;
  padding-horizontal: 15px;
`

const ButtonsWrapper = styled.View`
  padding-top: 10px;
`
