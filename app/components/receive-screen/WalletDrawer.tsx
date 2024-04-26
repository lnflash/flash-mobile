import React, { useState } from "react"
import styled from "styled-components/native"
import ReactNativeModal from "react-native-modal"
import { GaloyCurrencyBubble } from "../atomic/galoy-currency-bubble"
import { ListItem } from "@rneui/base"
import { useTheme } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { WalletCurrency } from "@app/graphql/generated"

const wallets = [
  { title: "Cash", key: "USD" },
  { title: "Bitcoin", key: "BTC" },
]

type Props = {
  currency: WalletCurrency
  onChange: (currency: WalletCurrency) => void
}

const WalletDrawer: React.FC<Props> = ({ currency, onChange }) => {
  const { theme } = useTheme()
  const colors = theme.colors
  const [modalVisible, setModalVisible] = useState(false)
  const bottom = useSafeAreaInsets().bottom

  const onChangeCurrency = (currency: string) => {
    onChange(currency as WalletCurrency)
    setModalVisible(false)
  }

  return (
    <>
      <Btn
        onPress={() => setModalVisible(true)}
        style={{ backgroundColor: colors.grey5, flex: 1 }}
      >
        <Row>
          <GaloyCurrencyBubble currency={currency} iconSize={16} />
          <BtnText style={{ color: colors.black }}>
            {currency === "USD" ? "Cash" : "Bitcoin"}
          </BtnText>
        </Row>
        <ListItem.Chevron
          name={modalVisible ? "chevron-down" : "chevron-up"}
          color={colors.grey0}
          size={20}
          type="ionicon"
        />
      </Btn>
      <ReactNativeModal
        isVisible={modalVisible}
        backdropColor={theme.mode === "dark" ? colors.grey4 : colors.black}
        backdropOpacity={0.7}
        onBackButtonPress={() => setModalVisible(false)}
        onBackdropPress={() => setModalVisible(false)}
        style={{
          justifyContent: "flex-end",
          margin: 0,
        }}
      >
        <Container pb={bottom} style={{ backgroundColor: colors.white }}>
          {wallets.map((el) => (
            <Btn
              key={el.key}
              onPress={() => onChangeCurrency(el.key)}
              style={{ backgroundColor: colors.grey4, marginBottom: 10 }}
            >
              <BtnText
                style={{ color: currency === el.key ? colors.primary : colors.grey1 }}
              >
                {el.title}
              </BtnText>
              <GaloyCurrencyBubble currency={el.key as WalletCurrency} iconSize={16} />
            </Btn>
          ))}
        </Container>
      </ReactNativeModal>
    </>
  )
}

export default WalletDrawer

const Btn = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-radius: 5px;
  padding-vertical: 15px;
  padding-horizontal: 10px;
`

const Row = styled.View`
  flex-direction: row;
  align-items: center;
`

const BtnText = styled.Text`
  font-size: 17px;
  margin-left: 5px;
`

const Container = styled.View<{ pb: number }>`
  background-color: #fff;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding-bottom: ${({ pb }) => pb || 10}px;
  padding-top: 30px;
  padding-horizontal: 20px;
`
