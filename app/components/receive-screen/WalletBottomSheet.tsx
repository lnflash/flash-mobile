import React, { useState } from "react"
import { Modal } from "react-native"
import styled from "styled-components/native"
import { useTheme, Text, Icon } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { WalletCurrency } from "@app/graphql/generated"
import { useI18nContext } from "@app/i18n/i18n-react"

// assets
import Cash from "@app/assets/icons/cash.svg"
import Bitcoin from "@app/assets/icons/bitcoin.svg"

const icons = {
  USD: Cash,
  BTC: Bitcoin,
}

const wallets = [
  { title: "Cash", key: "USD" },
  { title: "Bitcoin", key: "BTC" },
]

type Props = {
  currency: WalletCurrency
  disabled: boolean
  onChange: (currency: WalletCurrency) => void
}

const WalletBottomSheet: React.FC<Props> = ({ currency, disabled, onChange }) => {
  const { LL } = useI18nContext()
  const { colors, mode } = useTheme().theme

  const [modalVisible, setModalVisible] = useState(false)
  const bottom = useSafeAreaInsets().bottom

  const CurrencyIcon = icons[currency]

  const onChangeCurrency = (currency: string) => {
    onChange(currency as WalletCurrency)
    setModalVisible(false)
  }

  return (
    <>
      <Btn
        onPress={() => setModalVisible(true)}
        style={{ flex: 1, borderColor: colors.border01 }}
        disabled={disabled}
      >
        <Row>
          <CurrencyIcon width={25} height={25} style={{ marginRight: 10 }} />
          <Text type="bl">{currency === "USD" ? "Cash" : "Bitcoin"}</Text>
        </Row>
        <Icon
          name={modalVisible ? "chevron-up" : "chevron-down"}
          color={colors.icon01}
          type="ionicon"
        />
      </Btn>
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Backdrop onPress={() => setModalVisible(false)} activeOpacity={1} mode={mode}>
          <Container pb={bottom} style={{ backgroundColor: colors.white }}>
            <TitleWrapper>
              <Text type="h01">{LL.ReceiveScreen.selectWallet()}</Text>
              <Close onPress={() => setModalVisible(false)}>
                <Icon name={"close"} size={30} color={colors.black} type="ionicon" />
              </Close>
            </TitleWrapper>
            {wallets.map((el) => {
              const CurrencyIcon = icons[el.key as keyof typeof icons]
              return (
                <Btn
                  key={el.key}
                  onPress={() => onChangeCurrency(el.key)}
                  style={{
                    justifyContent: "flex-start",
                    borderColor: colors.border01,
                    marginBottom: 10,
                  }}
                >
                  <CurrencyIcon width={30} height={30} style={{ marginRight: 10 }} />
                  <Text type="bl">{el.title}</Text>
                </Btn>
              )
            })}
          </Container>
        </Backdrop>
      </Modal>
    </>
  )
}

export default WalletBottomSheet

const Btn = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-radius: 15px;
  border-width: 1px;
  padding-horizontal: 15px;
  padding-vertical: 10px;
`

const Row = styled.View`
  flex-direction: row;
  align-items: center;
`

const Backdrop = styled.TouchableOpacity<{ mode: string }>`
  flex: 1;
  justify-content: flex-end;
  background-color: ${({ mode }) =>
    mode === "dark" ? "rgba(57,57,57,.7)" : "rgba(0,0,0,.5)"};
`

const Container = styled.View<{ pb: number }>`
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding-bottom: ${({ pb }) => pb || 10}px;
  padding-top: 20px;
  padding-horizontal: 20px;
`

const TitleWrapper = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
`

const Close = styled.TouchableOpacity`
  padding: 5px;
`
