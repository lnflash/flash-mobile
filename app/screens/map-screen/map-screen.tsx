/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  useBusinessMapMarkersQuery,
  useMerchantMapSuggestMutation,
  useSettingsScreenQuery,
} from "@app/graphql/generated"
import { useLevel } from "@app/graphql/level-context"
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  gql,
  useQuery,
} from "@apollo/client"
import { useFocusEffect } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import * as React from "react"
import { useCallback } from "react"
// eslint-disable-next-line react-native/split-platform-components
import {
  PermissionsAndroid,
  Text,
  View,
  TouchableOpacity,
  Platform,
  Linking,
} from "react-native"
import { Button } from "@rneui/base"
import MapView, {
  Marker,
  Callout,
  // CalloutSubview,
  MapMarkerProps,
} from "react-native-maps"
import { Screen } from "../../components/screen"
import { RootStackParamList } from "../../navigation/stack-param-lists"
import { isIos } from "../../utils/helper"
import { toastShow } from "../../utils/toast"
import { useI18nContext } from "@app/i18n/i18n-react"
import crashlytics from "@react-native-firebase/crashlytics"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { makeStyles, useTheme } from "@rneui/themed"
import { MerchantSuggestModal } from "@app/components/merchant-suggest-modal"
import { useActivityIndicator } from "@app/hooks"

const httpLink = createHttpLink({
  uri: "https://api.blink.sv/graphql",
  // Add any required headers here
})

const blinkClient = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
})

const useStyles = makeStyles(({ colors }) => ({
  android: { marginTop: 18 },

  customView: {
    alignItems: "center",
    margin: 12,
  },

  ios: { paddingTop: 12 },

  map: {
    height: "100%",
    width: "100%",
  },

  title: { color: colors._darkGrey, fontSize: 18 },

  addButton: {
    position: "absolute",
    bottom: 30,
    right: 30,
    backgroundColor: colors.green,
    borderRadius: 50,
    height: 60,
    width: 60,
    opacity: 0.8,
  },

  plusText: {
    color: colors._white,
    // center the text verticall and horizontally in the parent view
    textAlign: "center",
    textAlignVertical: "center",
    lineHeight: 55,
    fontSize: 48,
  },

  viewContainer: { flex: 1 },
  overlayPadding: { padding: 20 },
  marginTop: { marginTop: 20 },
  addPinContainer: {
    position: "absolute",
    top: 90,
    backgroundColor: colors.green,
    height: 60,
    width: "100%",
    opacity: 0.8,
    justifyContent: "center",
    textAlignVertical: "center",
    alignItems: "center",
  },
  addPinText: {
    color: colors._white,
    fontSize: 18,
  },
}))

type Props = {
  navigation: StackNavigationProp<RootStackParamList, "Primary">
}

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

export const MapScreen: React.FC<Props> = ({ navigation }) => {
  const { toggleActivityIndicator } = useActivityIndicator()
  const { colors } = useTheme().theme
  const styles = useStyles()
  const isAuthed = useIsAuthed()
  const { LL } = useI18nContext()
  const { data } = useSettingsScreenQuery({ fetchPolicy: "cache-first" })
  const usernameTitle = data?.me?.username || LL.common.flashUser()
  const { currentLevel: level } = useLevel()

  const [isAddingPin, setIsAddingPin] = React.useState(false)
  const [modalVisible, setModalVisible] = React.useState(false)
  const [selectedLocation, setSelectedLocation] = React.useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const [title, setTitle] = React.useState("")
  const [merchantMapSuggest] = useMerchantMapSuggestMutation()

  const { data: blinkData, error: blinkError } = useQuery(BUSINESS_MAP_MARKERS_QUERY, {
    client: blinkClient, // Use the custom Apollo client
    fetchPolicy: "cache-and-network",
  })

  // Query using generated hook
  const {
    data: flashData,
    error: flashError,
    refetch,
  } = useBusinessMapMarkersQuery({
    fetchPolicy: "cache-and-network",
  })

  useFocusEffect(
    useCallback(() => {
      refetch()
    }, [refetch]),
  )

  // Handle errors from both queries
  if (blinkError || flashError) {
    const errorMessage = blinkError?.message || flashError?.message
    if (errorMessage) {
      toastShow({ message: errorMessage })
    }
  }

  // Merge data from both queries
  const maps = [
    ...(blinkData?.businessMapMarkers?.map((item: any) => ({
      ...item,
      source: "blink",
    })) ?? []),
    ...(flashData?.businessMapMarkers?.map((item: any) => ({
      ...item,
      source: "flash",
    })) ?? []),
  ]

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
            crashlytics().recordError(err)
          }
          console.debug(err)
        }
      }
      asyncRequestLocationPermission()
    }
    // disable eslint because we don't want to re-run this function when the language changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFocusEffect(requestLocationPermission)

  const markers: ReturnType<React.FC<MapMarkerProps>>[] = []
  maps.forEach((item: any, index) => {
    if (item) {
      // Function to open the location in Google Maps
      const openInGoogleMaps = () => {
        if (item.mapInfo.coordinates) {
          const url = `https://www.google.com/maps/search/?api=1&query=${item.mapInfo.coordinates.latitude},${item.mapInfo.coordinates.longitude}`
          Linking.openURL(url)
        }
      }
      const key = item.username + item.mapInfo.title + index
      const onPress = () => {
        const domain = item.source === "blink" ? "@blink.sv" : "@flashapp.me"
        const usernameWithDomain = `${item.username}${domain}`
        if (isAuthed && item?.username) {
          navigation.navigate("sendBitcoinDestination", { username: usernameWithDomain })
        } else {
          navigation.navigate("phoneFlow")
        }
      }

      markers.push(
        <Marker coordinate={item.mapInfo.coordinates} key={key} pinColor={colors._orange}>
          <Callout
            // alphaHitTest
            // tooltip
            onPress={() => (Boolean(item.username) && !isIos ? onPress() : null)}
          >
            <View style={styles.customView}>
              <Text style={styles.title}>{item.mapInfo.title}</Text>
              <Button
                containerStyle={isIos ? styles.ios : styles.android}
                title={LL.MapScreen.payBusiness()}
                onPress={onPress}
              />
              <Button
                containerStyle={isIos ? styles.ios : styles.android}
                title={LL.MapScreen.getDirections()}
                onPress={openInGoogleMaps}
              />
            </View>
          </Callout>
        </Marker>,
      )
    }
  })

  const handleMapPress = (event: any) => {
    if (isAddingPin) {
      const { latitude, longitude } = event.nativeEvent.coordinate
      setSelectedLocation({ latitude, longitude })
      setModalVisible(true)

      // Dismiss the toast and reset state
      setIsAddingPin(false)
    }
  }

  const handleAddPin = () => {
    setIsAddingPin(true)
    toastShow({
      message: "Press anywhere on the screen to select a location to add.",
      type: "success",
    })
  }

  const handleSubmit = () => {
    if (selectedLocation && title && usernameTitle) {
      setModalVisible(false)
      toggleActivityIndicator(true)
      const { latitude, longitude } = selectedLocation
      merchantMapSuggest({
        variables: {
          input: {
            latitude,
            longitude,
            title,
            username: usernameTitle,
          },
        },
      })
        .then(() => {
          setIsAddingPin(false)
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
    <Screen>
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
        {markers}
      </MapView>

      {/* Add Text letting user know they can click on the screen to add a pin */}
      {isAddingPin && (
        <View style={styles.addPinContainer}>
          <Text style={styles.addPinText}>{LL.MapScreen.addPin()}</Text>
        </View>
      )}

      {/* Plus Icon Button */}
      {level === "TWO" && (
        <TouchableOpacity style={styles.addButton} onPress={handleAddPin}>
          <Text style={styles.plusText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Modal for adding pin details */}
      {selectedLocation && (
        <MerchantSuggestModal
          isVisible={modalVisible}
          setIsVisible={setModalVisible}
          title={title}
          setTitle={setTitle}
          onSubmit={handleSubmit}
          selectedLocation={selectedLocation}
        />
      )}
    </Screen>
  )
}
