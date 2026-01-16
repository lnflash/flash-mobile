"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapScreen = void 0;
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-native/split-platform-components */
/* eslint-disable no-extra-boolean-cast */
/* eslint-disable no-implicit-coercion */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/display-name */
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_maps_1 = __importDefault(require("react-native-maps"));
const themed_1 = require("@rneui/themed");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const i18n_react_1 = require("@app/i18n/i18n-react");
// components
const screen_1 = require("../../components/screen");
const map_screen_1 = require("@app/components/map-screen");
// utils
const toast_1 = require("../../utils/toast");
// hooks
const hooks_1 = require("@app/hooks");
// gql
const generated_1 = require("@app/graphql/generated");
const client_1 = require("@apollo/client");
const httpLink = (0, client_1.createHttpLink)({
    uri: "https://api.blink.sv/graphql",
    // Add any required headers here
});
const blinkClient = new client_1.ApolloClient({
    link: httpLink,
    cache: new client_1.InMemoryCache(),
});
const BUSINESS_MAP_MARKERS_QUERY = (0, client_1.gql) `
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
`;
exports.MapScreen = (0, react_1.memo)(() => {
    var _a;
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { data } = (0, generated_1.useSettingsScreenQuery)({ fetchPolicy: "cache-first" });
    const usernameTitle = ((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username) || LL.common.flashUser();
    const [businessName, setBusinessName] = (0, react_1.useState)("");
    const [isAddingPin, setIsAddingPin] = (0, react_1.useState)(false);
    const [modalVisible, setModalVisible] = (0, react_1.useState)(false);
    const [selectedLocation, setSelectedLocation] = (0, react_1.useState)();
    const [merchantMapSuggest] = (0, generated_1.useMerchantMapSuggestMutation)();
    const { data: blinkData, error: blinkError, loading: blinkLoading, } = (0, client_1.useQuery)(BUSINESS_MAP_MARKERS_QUERY, {
        client: blinkClient,
        fetchPolicy: "cache-only",
    });
    const { data: flashData, error: flashError, refetch, loading: flashLoading, } = (0, generated_1.useBusinessMapMarkersQuery)({
        fetchPolicy: "cache-first",
    });
    (0, react_1.useEffect)(() => {
        const errorMessage = (blinkError === null || blinkError === void 0 ? void 0 : blinkError.message) || (flashError === null || flashError === void 0 ? void 0 : flashError.message);
        if (!!errorMessage) {
            (0, toast_1.toastShow)({ message: errorMessage, type: "error" });
        }
    }, [blinkError, flashError]);
    (0, react_1.useEffect)(() => {
        if (blinkLoading || flashLoading) {
            toggleActivityIndicator(true);
        }
        else {
            toggleActivityIndicator(false);
        }
    }, [blinkLoading, flashLoading]);
    (0, react_1.useEffect)(() => {
        requestLocationPermission();
    }, []);
    const requestLocationPermission = (0, react_1.useCallback)(() => {
        if (react_native_1.Platform.OS === "android") {
            const asyncRequestLocationPermission = async () => {
                try {
                    const granted = await react_native_1.PermissionsAndroid.request(react_native_1.PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
                        title: LL.MapScreen.locationPermissionTitle(),
                        message: LL.MapScreen.locationPermissionMessage(),
                        buttonNeutral: LL.MapScreen.locationPermissionNeutral(),
                        buttonNegative: LL.MapScreen.locationPermissionNegative(),
                        buttonPositive: LL.MapScreen.locationPermissionPositive(),
                    });
                    if (granted === react_native_1.PermissionsAndroid.RESULTS.GRANTED) {
                        console.debug("You can use the location");
                    }
                    else {
                        console.debug("Location permission denied");
                    }
                }
                catch (err) {
                    if (err instanceof Error) {
                        (0, crashlytics_1.getCrashlytics)().recordError(err);
                    }
                    console.debug(err);
                }
            };
            asyncRequestLocationPermission();
        }
    }, []);
    const handleMapPress = (event) => {
        if (isAddingPin) {
            const { latitude, longitude } = event.nativeEvent.coordinate;
            setSelectedLocation({ latitude, longitude });
            setModalVisible(true);
            setIsAddingPin(false);
        }
    };
    const handleSubmit = () => {
        if (selectedLocation && businessName && usernameTitle) {
            setModalVisible(false);
            toggleActivityIndicator(true);
            const { latitude, longitude } = selectedLocation;
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
                (0, toast_1.toastShow)({ message: "Pin added successfully!", type: "success" });
                refetch();
            })
                .catch((error) => {
                (0, toast_1.toastShow)({ message: "Error adding pin: " + error.message });
            })
                .finally(() => {
                toggleActivityIndicator(false);
            });
        }
    };
    return (<screen_1.Screen style={styles.center} keyboardShouldPersistTaps="handled">
      <react_native_maps_1.default style={styles.map} showsUserLocation={true} onPress={handleMapPress} // Add onPress event
     initialRegion={{
            latitude: 18.018,
            longitude: -77.329,
            latitudeDelta: 2.1,
            longitudeDelta: 2.1,
        }}>
        <map_screen_1.CustomMarker blinkData={blinkData} flashData={flashData}/>
      </react_native_maps_1.default>
      {!isAddingPin && <map_screen_1.RefreshButton onRefresh={() => refetch()}/>}
      <map_screen_1.AddPin visible={isAddingPin}/>
      <map_screen_1.AddButton handleOnPress={setIsAddingPin}/>
      <map_screen_1.MerchantSuggestModal isVisible={modalVisible} setIsVisible={setModalVisible} businessName={businessName} setBusinessName={setBusinessName} onSubmit={handleSubmit} selectedLocation={selectedLocation}/>
    </screen_1.Screen>);
});
const useStyles = (0, themed_1.makeStyles)(() => ({
    map: {
        height: "100%",
        width: "100%",
    },
    center: {
        alignItems: "center",
    },
}));
//# sourceMappingURL=map-screen.js.map