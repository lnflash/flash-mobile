import React, { useRef, useState } from "react"
import styled from "styled-components/native"
import { Alert, FlatList, TextInput } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import * as Keychain from "react-native-keychain"
import * as bip39 from "bip39"

// components
import { PrimaryBtn } from "@app/components/buttons"
import { Loading } from "@app/contexts/ActivityIndicatorContext"

// hooks
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useCreateAccount } from "@app/hooks/useCreateAccount"
import { Text, useTheme, useThemeMode } from "@rneui/themed"
import { usePersistentStateContext } from "@app/store/persistent-state"

// utils
import { disconnectToSDK, initializeBreezSDK } from "@app/utils/breez-sdk-liquid"

type Props = StackScreenProps<RootStackParamList, "ImportWallet">

const KEYCHAIN_MNEMONIC_KEY = "mnemonic_key"

const ImportWallet: React.FC<Props> = ({ navigation, route }) => {
  const insideApp = route.params?.insideApp
  const bottom = useSafeAreaInsets().bottom
  const { colors } = useTheme().theme
  const { mode } = useThemeMode()
  const { LL } = useI18nContext()
  const { updateState } = usePersistentStateContext()
  const { createDeviceAccountAndLogin } = useCreateAccount()

  const inputRef = useRef<TextInput[]>([])
  const [inputSeedPhrase, setInputSeedPhrase] = useState(Array(12).fill(""))
  const [loading, setLoading] = useState(false)

  const onComplete = async () => {
    setLoading(true)
    updateStateHandler(false)
    const mnemonicKey = inputSeedPhrase.join(" ").toLowerCase()
    const res = bip39.validateMnemonic(mnemonicKey)
    if (res) {
      if (insideApp) {
        await disconnectToSDK()
        await Keychain.setInternetCredentials(
          KEYCHAIN_MNEMONIC_KEY,
          KEYCHAIN_MNEMONIC_KEY,
          mnemonicKey,
        )
        await initializeBreezSDK()
        setTimeout(() => {
          updateStateHandler(true)
          setLoading(false)
          navigation.reset({ index: 0, routes: [{ name: "Primary" }] })
        }, 5000)
      } else {
        // const token: any = await createDeviceAccountAndLogin()
        // if (route.params?.onComplete) {
        //   route.params?.onComplete(token)
        // }
      }
    } else {
      setLoading(false)
      Alert.alert("Invalid recovery phrase")
    }
  }

  const updateStateHandler = (isAdvanceMode: boolean) => {
    updateState((state: any) => {
      if (state)
        return {
          ...state,
          btcTransactions: [],
          breezBalance: undefined,
          btcBalance: undefined,
          convertedBtcBalance: undefined,
          isAdvanceMode,
        }
      return undefined
    })
  }

  const renderItemHandler = ({ index }: { index: number }) => {
    return (
      <SeedPhrase style={{ backgroundColor: mode === "dark" ? "#5b5b5b" : "#ededed" }}>
        <SeedPhraseNum style={{ borderRightColor: colors.white }}>
          <Text type="p1" bold>
            {index + 1}
          </Text>
        </SeedPhraseNum>
        <SeedPhraseText>
          <Input
            // @ts-ignore
            ref={(el: TextInput) => (inputRef.current[index] = el)}
            value={inputSeedPhrase[index]}
            autoCapitalize="none"
            blurOnSubmit={false}
            onChangeText={(text) => {
              const updatedInput = [...inputSeedPhrase]
              updatedInput[index] = text
              setInputSeedPhrase(updatedInput)
            }}
            onSubmitEditing={() => {
              if (index === 11) {
                inputRef.current[index].blur()
              } else {
                inputRef.current[index + 1].focus()
              }
            }}
            returnKeyType={index === 11 ? "done" : "next"}
            style={{ color: colors.black }}
          />
        </SeedPhraseText>
      </SeedPhrase>
    )
  }

  const disabled = inputSeedPhrase.findIndex((el) => el === "") !== -1

  return (
    <Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <Text type="h01" bold style={{ textAlign: "center" }}>
          {insideApp ? LL.ImportWallet.importTitle() : LL.ImportWallet.title()}
        </Text>
        <Text type="p1" color={colors.grey2} style={{ textAlign: "center" }}>
          {LL.ImportWallet.description()}
        </Text>
        <FlatList
          data={inputSeedPhrase}
          numColumns={2}
          renderItem={renderItemHandler}
          columnWrapperStyle={{ justifyContent: "space-between", columnGap: 15 }}
          scrollEnabled={false}
          style={{ marginVertical: 20 }}
        />
      </Container>
      <PrimaryBtn
        label={LL.ImportWallet.complete()}
        disabled={disabled}
        loading={loading}
        onPress={onComplete}
        btnStyle={{ marginBottom: bottom || 10 }}
      />
      {loading && <Loading />}
    </Wrapper>
  )
}

export default ImportWallet

const Wrapper = styled.View`
  flex: 1;
  justify-content: space-between;
  padding-horizontal: 20px;
`

const Container = styled.View`
  row-gap: 10px;
`

const SeedPhrase = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  border-radius: 20px;
  margin-bottom: 10px;
  overflow: hidden;
`

const SeedPhraseNum = styled.View<{ selectedInOrder?: boolean }>`
  width: 50px;
  height: 46px;
  align-items: center;
  justify-content: center;
  border-right-width: 2px;
`

const SeedPhraseText = styled.View`
  flex: 1;
  align-items: center;
`

const Input = styled.TextInput`
  width: 100%;
  height: 46px;
  font-size: 18px;
  font-weight: 600;
  font-family: "Sora-Bold";
  padding-horizontal: 5px;
`
