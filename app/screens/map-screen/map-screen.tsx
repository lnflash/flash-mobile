/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-native/split-platform-components */
/* eslint-disable no-extra-boolean-cast */
/* eslint-disable no-implicit-coercion */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/display-name */
import React, { memo, useCallback, useEffect, useState } from "react"
import { Linking, PermissionsAndroid, Platform } from "react-native"
import MapView from "react-native-maps"
import { makeStyles } from "@rneui/themed"
import { getCrashlytics } from "@react-native-firebase/crashlytics"
import { useI18nContext } from "@app/i18n/i18n-react"

// components
import { Screen } from "../../components/screen"
import {
  AddButton,
  AddPin,
  BusinessCardModal,
  CustomMarker,
  MerchantSuggestModal,
  RefreshButton,
} from "@app/components/map-screen"

// utils
import { toastShow } from "../../utils/toast"

// hooks
import { useActivityIndicator } from "@app/hooks"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { usePersistentStateContext } from "@app/store/persistent-state"

// gql
import {
  useBusinessMapMarkersQuery,
  useMerchantMapSuggestMutation,
  useSettingsScreenQuery,
} from "@app/graphql/generated"
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  gql,
  useQuery,
} from "@apollo/client"

const httpLink = createHttpLink({
  uri: "https://api.blink.sv/graphql",
  // Add any required headers here
})

const blinkClient = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
})

const BUSINESS_MAP_MARKERS_QUERY = gql`
  query businessMapMarkers {
    businessMapMarkers {
      username
      mapInfo {
        title
        coordinates {
          longitude
          latitude
        }
      }
    }
  }
`

export const MapScreen = memo(() => {
  const { toggleActivityIndicator } = useActivityIndicator()
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { data } = useSettingsScreenQuery({ fetchPolicy: "cache-first" })
  const usernameTitle = data?.me?.username || LL.common.flashUser()

  const [businessName, setBusinessName] = useState("")
  const [isAddingPin, setIsAddingPin] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number
    longitude: number
  }>()
  const [selectedMarker, setSelectedMarker] = useState<any>(null)
  const [cardVisible, setCardVisible] = useState(false)
  const isAuthed = useIsAuthed()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { persistentState } = usePersistentStateContext()
  const chatEnabled = persistentState?.chatEnabled ?? false

  const [merchantMapSuggest] = useMerchantMapSuggestMutation()
  const {
    data: blinkData,
    error: blinkError,
    loading: blinkLoading,
  } = useQuery(BUSINESS_MAP_MARKERS_QUERY, {
    client: blinkClient, // Use the custom Apollo client
    fetchPolicy: "cache-only",
  })
  const {
    data: flashData,
    error: flashError,
    refetch,
    loading: flashLoading,
  } = useBusinessMapMarkersQuery({
    fetchPolicy: "cache-first",
  })

  const DOMAIN_MAP = { blink: "@blink.sv", flash: "@flashapp.me" } as const

  const handleMarkerPress = useCallback((item: any) => {
    setSelectedMarker(item)
    setCardVisible(true)
  }, [])

  const handlePayBusiness = useCallback(() => {
    if (!selectedMarker) return
    setCardVisible(false)
    const domain = DOMAIN_MAP[selectedMarker.source as keyof typeof DOMAIN_MAP]
    const usernameWithDomain = `${selectedMarker.username}${domain}`
    if (isAuthed && selectedMarker.username) {
      navigation.navigate("sendBitcoinDestination", { username: usernameWithDomain })
    } else {
      navigation.navigate("phoneFlow")
    }
  }, [selectedMarker, isAuthed, navigation])

  const handleGetDirections = useCallback(() => {
    if (!selectedMarker) return
    setCardVisible(false)
    const { latitude, longitude } = selectedMarker.mapInfo.coordinates
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    )
  }, [selectedMarker])

  const handleChat = useCallback(() => {
    if (!selectedMarker) return
    setCardVisible(false)
  }, [selectedMarker])

  useEffect(() => {
    const errorMessage = blinkError?.message || flashError?.message
    if (!!errorMessage) {
      toastShow({ message: errorMessage, type: "error" })
    }
  }, [blinkError, flashError])

  useEffect(() => {
    if (blinkLoading || flashLoading) {
      toggleActivityIndicator(true)
    } else {
      toggleActivityIndicator(false)
    }
  }, [blinkLoading, flashLoading])

  useEffect(() => {
    requestLocationPermission()
  }, [])

  const requestLocationPermission = useCallback(() => {
    if (Platform.OS === "android") {
      const asyncRequestLocationPermission = async () => {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: LL.MapScreen.locationPermissionTitle(),
              message: LL.MapScreen.locationPermissionMessage(),
              buttonNeutral: LL.MapScreen.locationPermissionNeutral(),
              buttonNegative: LL.MapScreen.locationPermissionNegative(),
              buttonPositive: LL.MapScreen.locationPermissionPositive(),
            },
          )
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            console.debug("You can use the location")
          } else {
            console.debug("Location permission denied")
          }
        } catch (err: unknown) {
          if (err instanceof Error) {
            getCrashlytics().recordError(err)
          }
          console.debug(err)
        }
      }
      asyncRequestLocationPermission()
    }
  }, [])

  const handleMapPress = (event: any) => {
    if (isAddingPin) {
      const { latitude, longitude } = event.nativeEvent.coordinate
      setSelectedLocation({ latitude, longitude })
      setModalVisible(true)
      setIsAddingPin(false)
    }
  }

  const handleSubmit = () => {
    if (selectedLocation && businessName && usernameTitle) {
      setModalVisible(false)
      toggleActivityIndicator(true)
      const { latitude, longitude } = selectedLocation
      merchantMapSuggest({
        variables: {
          input: {
            latitude,
            longitude,
            title: businessName,
            username: usernameTitle,
          },
        },
      })
        .then(() => {
          toastShow({ message: "Pin added successfully!", type: "success" })
          refetch()
        })
        .catch((error: any) => {
          toastShow({ message: "Error adding pin: " + error.message })
        })
        .finally(() => {
          toggleActivityIndicator(false)
        })
    }
  }

  return (
    <Screen style={styles.center} keyboardShouldPersistTaps="handled">
      <MapView
        style={styles.map}
        showsUserLocation={true}
        onPress={handleMapPress} // Add onPress event
        initialRegion={{
          latitude: 18.018,
          longitude: -77.329,
          latitudeDelta: 2.1,
          longitudeDelta: 2.1,
        }}
      >
        <CustomMarker
          blinkData={blinkData}
          flashData={flashData}
          onMarkerPress={handleMarkerPress}
        />
      </MapView>
      {!isAddingPin && <RefreshButton onRefresh={() => refetch()} />}
      <AddPin visible={isAddingPin} />
      <AddButton handleOnPress={setIsAddingPin} />
      <MerchantSuggestModal
        isVisible={modalVisible}
        setIsVisible={setModalVisible}
        businessName={businessName}
        setBusinessName={setBusinessName}
        onSubmit={handleSubmit}
        selectedLocation={selectedLocation}
      />
      <BusinessCardModal
        visible={cardVisible}
        item={selectedMarker}
        chatEnabled={chatEnabled}
        onClose={() => setCardVisible(false)}
        onPayBusiness={handlePayBusiness}
        onGetDirections={handleGetDirections}
        onChat={handleChat}
      />
    </Screen>
  )
})

const useStyles = makeStyles(() => ({
  map: {
    height: "100%",
    width: "100%",
  },
  center: {
    alignItems: "center",
  },
}))
