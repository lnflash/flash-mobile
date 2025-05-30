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

type Props = StackScreenProps<RootStackParamList, "BackupVerify">

type ShuffledPhraseType = {
  key: string
  order: number
  selectedInOrder?: boolean
}

const BackupVerify: React.FC<Props> = ({ navigation }) => {
  const bottom = useSafeAreaInsets().bottom
  const { colors } = useTheme().theme
  const { mode } = useThemeMode()
  const { LL } = useI18nContext()

  const [selectOrder, setSelectOrder] = useState(0)
  const [shuffledSeedPhrase, setShuffledSeedPhrase] = useState<ShuffledPhraseType[]>([])

  useEffect(() => {
    getSeedPhrase()
  }, [])

  const getSeedPhrase = async () => {
    const credentials = await Keychain.getInternetCredentials("mnemonic_key")
    if (credentials) {
      const phrases: ShuffledPhraseType[] = credentials.password
        .split(" ")
        .map((el, index) => ({
          key: el,
          order: index,
          selectedInOrder: undefined,
        }))
      shuffleSeedPhrase(phrases)
    }
  }

  const shuffleSeedPhrase = (array: ShuffledPhraseType[]) => {
    let currentIndex = array.length,
      randomIndex

    while (currentIndex > 0) {
      randomIndex = Math.floor(Math.random() * currentIndex)
      currentIndex--
      ;[array[currentIndex], array[randomIndex]] = [
        array[randomIndex],
        array[currentIndex],
      ]
    }
    setSelectOrder(0)
    setShuffledSeedPhrase(array.map((el) => ({ ...el, selectedInOrder: undefined })))
  }

  const onSelect = (item: ShuffledPhraseType, index: number) => {
    const updatedShuffledSeedPhrase = [...shuffledSeedPhrase]
    let updatedSelectOrder = selectOrder

    if (item.order === selectOrder) {
      updatedShuffledSeedPhrase[index].selectedInOrder = true
      updatedSelectOrder++
    } else {
      updatedShuffledSeedPhrase[index].selectedInOrder = false
      updatedSelectOrder++
    }

    setShuffledSeedPhrase(updatedShuffledSeedPhrase)
    setSelectOrder(updatedSelectOrder)
  }

  const onContinue = () => {
    navigation.navigate("BackupComplete")
  }

  let wrongSelect = false

  shuffledSeedPhrase.forEach((el) => {
    if (el.selectedInOrder === false) {
      wrongSelect = true
    }
  })

  const renderItemHandler = ({
    item,
    index,
  }: {
    item: ShuffledPhraseType
    index: number
  }) => {
    return (
      <SeedPhrase
        onPress={() => onSelect(item, index)}
        disabled={wrongSelect || item.selectedInOrder}
        style={{ backgroundColor: mode === "dark" ? "#5b5b5b" : "#ededed" }}
        marginRight={index % 2 === 0}
      >
        <SeedPhraseNum
          style={{ borderRightColor: colors.white }}
          selectedInOrder={item.selectedInOrder}
        >
          <Text type="p1" bold>
            {item.selectedInOrder !== undefined
              ? item.selectedInOrder
                ? item.order + 1
                : selectOrder
              : ""}
          </Text>
        </SeedPhraseNum>
        <SeedPhraseText>
          <Text type="p1" bold>
            {item.key}
          </Text>
        </SeedPhraseText>
      </SeedPhrase>
    )
  }

  return (
    <Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <Text type="h01" bold style={{ textAlign: "center" }}>
          {selectOrder === 12 && !wrongSelect
            ? LL.BackupVerify.correctTitle()
            : wrongSelect
            ? LL.BackupVerify.wrongTitle()
            : LL.BackupVerify.title()}
        </Text>
        <FlatList
          data={shuffledSeedPhrase}
          numColumns={2}
          renderItem={renderItemHandler}
          columnWrapperStyle={{ justifyContent: "space-between" }}
          scrollEnabled={false}
          style={{ marginVertical: 20 }}
        />
      </Container>
      <ButtonsWrapper>
        <PrimaryBtn
          type="outline"
          label={LL.BackupVerify.tryAgain()}
          onPress={() => shuffleSeedPhrase(shuffledSeedPhrase)}
          btnStyle={{ marginBottom: 20 }}
        />
        <PrimaryBtn
          label={LL.BackupVerify.continue()}
          disabled={!(selectOrder === 12 && !wrongSelect)}
          onPress={onContinue}
          btnStyle={{ marginBottom: bottom || 10 }}
        />
      </ButtonsWrapper>
    </Wrapper>
  )
}

export default BackupVerify

const Wrapper = styled.View`
  flex: 1;
  justify-content: space-between;
`

const Container = styled.View`
  row-gap: 10;
  padding-horizontal: 20px;
`

const SeedPhrase = styled.TouchableOpacity<{ marginRight: boolean }>`
  flex: 1;
  flex-direction: row;
  align-items: center;
  border-radius: 20px;
  margin-bottom: 10px;
  margin-right: ${({ marginRight }) => (marginRight ? 15 : 0)}px;
  overflow: hidden;
`
const SeedPhraseNum = styled.View<{ selectedInOrder?: boolean }>`
  width: 50px;
  height: 100%;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  border-right-width: 2px;
  padding-left: 5px;
  background-color: ${({ selectedInOrder }) =>
    selectedInOrder === undefined
      ? "transparent"
      : selectedInOrder
      ? "#34C571"
      : "#EB5757"};
`

const SeedPhraseText = styled.View`
  flex: 1;
  padding-horizontal: 15;
  padding-vertical: 14px;
`

const ButtonsWrapper = styled.View`
  padding-top: 10px;
  padding-horizontal: 20px;
`
