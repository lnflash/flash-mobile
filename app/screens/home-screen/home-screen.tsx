import React, { useCallback, useEffect, useState } from "react"
import { RefreshControl, ScrollView } from "react-native"
import { useTheme } from "@rneui/themed"

// components
import WalletOverview from "@app/components/wallet-overview/wallet-overview"
import { SetDefaultAccountModal } from "@app/components/set-default-account-modal"
import { UnVerifiedSeedModal } from "@app/components/unverified-seed-modal"
import { Screen } from "@app/components/screen"
import {
  AccountCreateModal,
  Buttons,
  Header,
  Info,
  QuickStart,
  Transactions,
} from "@app/components/home-screen"

// gql
import {
  TransactionEdge,
  useHomeAuthedQuery,
  useRealtimePriceQuery,
} from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { getDefaultWallet } from "@app/graphql/wallets-utils"

// store
import { useAppDispatch } from "@app/store/redux"
import { setUserData } from "@app/store/redux/slices/userSlice"
import { usePersistentStateContext } from "@app/store/persistent-state"

export const HomeScreen: React.FC = () => {
  const { colors } = useTheme().theme

  const dispatch = useAppDispatch()
  const { persistentState, updateState } = usePersistentStateContext()

  const [modalVisible, setModalVisible] = useState(false)
  const [refreshTriggered, setRefreshTriggered] = useState(false)
  const [defaultAccountModalVisible, setDefaultAccountModalVisible] = useState(false)
  const [isUnverifiedSeedModalVisible, setIsUnverifiedSeedModalVisible] = useState(false)

  // queries
  const isAuthed = useIsAuthed()
  const {
    data: dataAuthed,
    loading: loadingAuthed,
    error,
    refetch: refetchAuthed,
  } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
    errorPolicy: "all",
    nextFetchPolicy: "cache-and-network", // this enables offline mode use-case
  })
  const { refetch: refetchRealtimePrice } = useRealtimePriceQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
    nextFetchPolicy: "cache-and-network", // this enables offline mode use-case
  })

  const transactions = dataAuthed?.me?.defaultAccount.transactions?.edges || []

  useEffect(() => {
    if (dataAuthed?.me) {
      dispatch(setUserData(dataAuthed.me))
      saveDefaultWallet()
    }
  }, [dataAuthed])

  const saveDefaultWallet = () => {
    const defaultWallet = getDefaultWallet(
      dataAuthed?.me?.defaultAccount?.wallets,
      dataAuthed?.me?.defaultAccount?.defaultWalletId,
    )
    if (
      !persistentState.defaultWallet ||
      (persistentState.defaultWallet.walletCurrency === "USD" &&
        persistentState.defaultWallet.id !== defaultWallet?.id)
    ) {
      updateState((state: any) => {
        if (state)
          return {
            ...state,
            defaultWallet,
          }
        return undefined
      })
    }
  }

  const refetch = useCallback(() => {
    if (isAuthed) {
      refetchRealtimePrice()
      refetchAuthed()
      setRefreshTriggered(true)
      setTimeout(() => setRefreshTriggered(false), 1000)
    }
  }, [isAuthed, refetchAuthed, refetchRealtimePrice])

  const renderRefreshControl = () => (
    <RefreshControl
      refreshing={refreshTriggered}
      onRefresh={refetch}
      colors={[colors.primary]} // Android refresh indicator colors
      tintColor={colors.primary} // iOS refresh indicator color
    />
  )

  return (
    <Screen backgroundColor={colors.background}>
      <Header />
      <ScrollView refreshControl={renderRefreshControl()}>
        <WalletOverview
          setIsUnverifiedSeedModalVisible={setIsUnverifiedSeedModalVisible}
        />
        <Info refreshTriggered={refreshTriggered} error={error} />
        <Buttons
          setModalVisible={setModalVisible}
          setDefaultAccountModalVisible={setDefaultAccountModalVisible}
        />
        <QuickStart />
        <Transactions
          refreshTriggered={refreshTriggered}
          loadingAuthed={loadingAuthed}
          transactionsEdges={transactions as TransactionEdge[]}
        />
      </ScrollView>
      <SetDefaultAccountModal
        isVisible={defaultAccountModalVisible}
        toggleModal={() => setDefaultAccountModalVisible(!defaultAccountModalVisible)}
      />
      <UnVerifiedSeedModal
        isVisible={isUnverifiedSeedModalVisible}
        setIsVisible={setIsUnverifiedSeedModalVisible}
      />
      <AccountCreateModal modalVisible={modalVisible} setModalVisible={setModalVisible} />
    </Screen>
  )
}
