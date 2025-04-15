import React, { useState } from "react"
import { Modal } from "react-native"
import styled from "styled-components/native"
import { Icon, Text, useTheme } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { InvoiceType } from "@app/screens/receive-bitcoin-screen/payment/index.types"
import { useI18nContext } from "@app/i18n/i18n-react"

type Props = {
  currency: CurrencyType
  type: InvoiceType
  disabled: boolean
  onChange: (type: InvoiceType) => void
}

const ReceiveTypeBottomSheet: React.FC<Props> = ({
  currency,
  type,
  disabled,
  onChange,
}) => {
  const { LL } = useI18nContext()
  const { colors, mode } = useTheme().theme

  const [modalVisible, setModalVisible] = useState(false)
  const bottom = useSafeAreaInsets().bottom

  const onChangeType = (type: string) => {
    onChange(type as InvoiceType)
    setModalVisible(false)
  }

  let receivingTypes = [
    { key: "Lightning", title: "Lightning", icon: "flash", color: "#F0C243" },
    { key: "PayCode", title: "Paycode", icon: "at", color: "#E8D315" },
    { key: "OnChain", title: "Onchain ", icon: "logo-bitcoin", color: "#41AC48" },
  ]

  if (currency === "BTC") {
    receivingTypes = receivingTypes.filter((el) => el.key !== "PayCode")
  }

  return (
    <>
      <Btn
        onPress={() => setModalVisible(true)}
        style={{ flex: 1, borderColor: colors.border01 }}
        disabled={disabled}
      >
        <Row>
          <Icon
            name={receivingTypes.find((el) => el.key === type)?.icon as string}
            color={receivingTypes.find((el) => el.key === type)?.color as string}
            size={25}
            style={{ marginRight: 5 }}
            type="ionicon"
          />
          <Text type="bl">{receivingTypes.find((el) => el.key === type)?.title}</Text>
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
              <Text type="h01">{LL.ReceiveScreen.selectPaymentMethod()}</Text>
              <Close onPress={() => setModalVisible(false)}>
                <Icon name={"close"} size={30} color={colors.black} type="ionicon" />
              </Close>
            </TitleWrapper>
            {receivingTypes.map((el) => (
              <Btn
                key={el.key}
                onPress={() => onChangeType(el.key)}
                style={{
                  justifyContent: "flex-start",
                  borderColor: colors.border01,
                  marginBottom: 10,
                }}
              >
                <Icon
                  name={el.icon}
                  size={30}
                  style={{ marginRight: 10 }}
                  color={el.color}
                  type="ionicon"
                />
                <Text type="bl">{el.title}</Text>
              </Btn>
            ))}
          </Container>
        </Backdrop>
      </Modal>
    </>
  )
}

export default ReceiveTypeBottomSheet

const Btn = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-radius: 15px;
  border-width: 1px;
  padding: 10px;
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
