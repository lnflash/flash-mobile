import React from "react"
import styled from "styled-components/native"
import { Text, useTheme } from "@rneui/themed"

// components
import HideableArea from "../hideable-area/hideable-area"

// hooks
import { useHideBalanceQuery } from "@app/graphql/generated"

// assets
import Cash from "@app/assets/icons/cash.svg"
import Bitcoin from "@app/assets/icons/bitcoin.svg"
import Flashcard from "@app/assets/icons/flashcard.svg"
import CardAdd from "@app/assets/icons/card-add.svg"
import Sync from "@app/assets/icons/sync.svg"
import Warning from "@app/assets/icons/warning.svg"
import Cashu from "@app/assets/icons/cashu.svg"

const icons = {
  cash: Cash,
  bitcoin: Bitcoin,
  flashcard: Flashcard,
  cardAdd: CardAdd,
  sync: Sync,
  warning: Warning,
  cashu: Cashu,
}

type IconNamesType = keyof typeof icons

type Props = {
  icon: IconNamesType
  title: string
  amount?: string
  currency: string
  emptyText?: string
  rightIcon?: IconNamesType
  onPress: () => void
  onPressRightBtn?: () => void
}

const Balance: React.FC<Props> = ({
  icon,
  title,
  amount,
  currency,
  emptyText,
  rightIcon,
  onPress,
  onPressRightBtn,
}) => {
  const { colors } = useTheme().theme
  const { data: { hideBalance = false } = {} } = useHideBalanceQuery()

  const Icon = icons[icon]
  const RightIcon = icons[rightIcon ? rightIcon : "sync"]

  return (
    <Wrapper onPress={onPress} activeOpacity={0.5} color={colors.layer}>
      <Icon color={colors.icon01} />
      {!!amount ? (
        <>
          <ColumnWrapper>
            <Text type="p4" style={{ marginBottom: 4 }} color={colors.text02}>
              {title}
            </Text>
            <HideableArea isContentVisible={hideBalance}>
              <Text type="h02" bold>
                {amount}{" "}
                <Text type="h02" color={colors.text02}>
                  {currency}
                </Text>
              </Text>
            </HideableArea>
          </ColumnWrapper>
          {!!rightIcon && !hideBalance && (
            <RightBtn onPress={onPressRightBtn}>
              <RightIcon color={colors.icon01} width={30} height={30} />
            </RightBtn>
          )}
        </>
      ) : (
        <ColumnWrapper>
          <Text type="h02" bold>
            {emptyText}
          </Text>
        </ColumnWrapper>
      )}
    </Wrapper>
  )
}

export default Balance

const Wrapper = styled.TouchableOpacity<{ color: string }>`
  min-height: 87px;
  flex-direction: row;
  align-items: center;
  border-radius: 20px;
  background-color: ${({ color }) => color};
  padding: 16px;
  padding-right: 0;
  margin-vertical: 5px;
`

const ColumnWrapper = styled.View`
  flex: 1;
  margin-left: 24px;
`

const RightBtn = styled.TouchableOpacity`
  padding-horizontal: 15px;
  padding-vertical: 10px;
`
