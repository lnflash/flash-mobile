import React, { useEffect, useState, useCallback } from "react"
import { makeStyles, SearchBar, Text } from "@rneui/themed"
import { ScrollView, View } from "react-native"
import { gql } from "@apollo/client"
import { CommonActions, useNavigation } from "@react-navigation/native"
import Icon from "react-native-vector-icons/Ionicons"

// components
import { Screen } from "../../components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { Loading } from "@app/contexts/ActivityIndicatorContext"
import { MenuSelect, MenuSelectItem } from "@app/components/menu-select"

// hooks
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useI18nContext } from "@app/i18n/i18n-react"

// gql
import {
  Currency,
  RealtimePriceDocument,
  useAccountUpdateDisplayCurrencyMutation,
  useCurrencyListQuery,
  useDisplayCurrencyQuery,
} from "@app/graphql/generated"

// utils
import { testProps } from "@app/utils/testProps"

gql`
  mutation accountUpdateDisplayCurrency($input: AccountUpdateDisplayCurrencyInput!) {
    accountUpdateDisplayCurrency(input: $input) {
      errors {
        message
      }
      account {
        id
        displayCurrency
      }
    }
  }
`

export const DisplayCurrencyScreen: React.FC = () => {
  const { LL } = useI18nContext()
  const styles = useStyles()
  const isAuthed = useIsAuthed()
  const navigation = useNavigation()

  const [newCurrency, setNewCurrency] = useState("")
  const [searchText, setSearchText] = useState("")
  const [matchingCurrencies, setMatchingCurrencies] = useState<Currency[]>([])

  const { updateState } = usePersistentStateContext()

  const [updateDisplayCurrency] = useAccountUpdateDisplayCurrencyMutation()
  const { data: dataAuthed } = useDisplayCurrencyQuery({ skip: !isAuthed })
  const { data, loading } = useCurrencyListQuery({
    fetchPolicy: "cache-and-network",
    skip: !isAuthed,
  })

  const displayCurrency = dataAuthed?.me?.defaultAccount?.displayCurrency

  useEffect(() => {
    data?.currencyList && setMatchingCurrencies(data.currencyList.slice())
  }, [data?.currencyList])

  const reset = () => {
    setSearchText("")
    setMatchingCurrencies(data?.currencyList?.slice() ?? [])
  }

  const updateMatchingCurrency = useCallback(
    (newSearchText: string) => {
      if (!data?.currencyList) {
        return
      }
      setSearchText(newSearchText)

      const currencies = data.currencyList.slice()
      const matchSearch = getMatchingCurrencies(newSearchText, currencies)
      const currencyWithSearch = newSearchText.length > 0 ? matchSearch : currencies

      // make sure the display currency is always in the list
      if (!currencyWithSearch.find((c) => c.id === displayCurrency)) {
        const currency = currencies.find((c) => c.id === displayCurrency)
        currency && currencyWithSearch.push(currency)
      }

      // sort to make sure selection currency always on top
      currencyWithSearch.sort((a, b) => {
        if (a.id === displayCurrency) {
          return -1
        }
        if (b.id === displayCurrency) {
          return 1
        }
        return 0
      })

      setMatchingCurrencies(currencyWithSearch)
    },
    [data?.currencyList, displayCurrency],
  )

  const handleCurrencyChange = async (currencyId: string) => {
    if (loading) return
    await updateDisplayCurrency({
      variables: { input: { currency: currencyId } },
      refetchQueries: [RealtimePriceDocument],
    })
    updateState((state: any) => {
      if (state)
        return {
          ...state,
          currencyChanged: true,
        }
      return undefined
    })
    setNewCurrency(currencyId)
  }

  const handleSave = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "Primary" }],
      }),
    )
  }

  if (loading) return <Loading />

  if (!data?.currencyList) {
    return (
      <View style={styles.errorContainer}>
        <Text type="h1">{LL.DisplayCurrencyScreen.errorLoading()}</Text>
      </View>
    )
  }

  return (
    <Screen>
      <SearchBar
        {...testProps(LL.common.search())}
        placeholder={LL.common.search()}
        value={searchText}
        onChangeText={updateMatchingCurrency}
        platform="default"
        round
        showLoading={false}
        containerStyle={styles.searchBarContainer}
        inputContainerStyle={styles.searchBarInputContainerStyle}
        inputStyle={styles.searchBarText}
        rightIconContainerStyle={styles.searchBarRightIconStyle}
        searchIcon={<Icon name="search" size={24} />}
        clearIcon={<Icon name="close" size={24} onPress={reset} />}
      />
      <ScrollView>
        <MenuSelect
          value={newCurrency || displayCurrency || ""}
          onChange={handleCurrencyChange}
        >
          {matchingCurrencies.map((currency) => (
            <MenuSelectItem key={currency.id} value={currency.id}>
              {currency.id} - {currency.name} {currency.flag && `- ${currency.flag}`}
            </MenuSelectItem>
          ))}
        </MenuSelect>
      </ScrollView>
      <PrimaryBtn
        label={LL.common.confirm()}
        onPress={handleSave}
        btnStyle={styles.buttonContainer}
      />
    </Screen>
  )
}

export const wordMatchesCurrency = (searchWord: string, currency: Currency): boolean => {
  const matchForName = currency.name.toLowerCase().includes(searchWord.toLowerCase())
  const matchForId = currency.id.toLowerCase().includes(searchWord.toLowerCase())

  return matchForName || matchForId
}

export const getMatchingCurrencies = (searchText: string, currencies: Currency[]) => {
  const searchWordArray = searchText.split(" ").filter((text) => text.trim().length > 0)

  return currencies.filter((currency) =>
    searchWordArray.some((word) => wordMatchesCurrency(word, currency)),
  )
}

const useStyles = makeStyles(({ colors }) => ({
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBarContainer: {
    backgroundColor: colors.white,
    borderBottomWidth: 0,
    borderTopWidth: 0,
    marginHorizontal: 26,
    marginVertical: 8,
    paddingTop: 8,
  },
  searchBarInputContainerStyle: {
    backgroundColor: colors.grey5,
  },
  searchBarRightIconStyle: {
    padding: 8,
  },
  searchBarText: {
    color: colors.black,
    textDecorationLine: "none",
  },
  buttonContainer: {
    margin: 20,
  },
}))
