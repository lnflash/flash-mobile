"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerchantSuggestModal = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
// assets
const pin_image_ln_png_1 = __importDefault(require("../../assets/images/pin-image-ln.png"));
// components
const galoy_primary_button_1 = require("../atomic/galoy-primary-button");
const galoy_secondary_button_1 = require("../atomic/galoy-secondary-button");
const MerchantSuggestModal = ({ isVisible, setIsVisible, businessName, setBusinessName, onSubmit, selectedLocation, }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const closeModal = () => {
        setIsVisible(false);
    };
    // Function to open the location in Google Maps
    const openInGoogleMaps = () => {
        if (selectedLocation) {
            const url = `https://www.google.com/maps/search/?api=1&query=${selectedLocation.latitude},${selectedLocation.longitude}`;
            react_native_1.Linking.openURL(url);
        }
    };
    return (<react_native_modal_1.default isVisible={isVisible} backdropOpacity={0.3} backdropColor={colors.grey3} onBackdropPress={closeModal} style={styles.topScreen}>
      <react_native_1.View style={styles.modalCard}>
        <react_native_1.ScrollView style={styles.scrollViewStyle} keyboardShouldPersistTaps="handled">
          <react_native_1.TouchableWithoutFeedback onPress={react_native_1.Keyboard.dismiss}>
            <react_native_1.View>
              <themed_1.Image source={pin_image_ln_png_1.default} style={styles.stableSatsImage} resizeMode="contain"/>
              <themed_1.Text style={styles.cardTitle} type={"h2"}>
                {LL.MerchantSuggestModal.header()}
              </themed_1.Text>

              <themed_1.Text style={styles.cardDescription} type="p2">
                {LL.MerchantSuggestModal.body()}{" "}
              </themed_1.Text>

              {/* Display the selected coordinates */}
              {selectedLocation && (<react_native_1.View style={styles.marginBottom}>
                  <themed_1.Text style={styles.cardDescription}>
                    {LL.MapScreen.selectedCoordinates()}
                    {"Latitude: "}
                    {selectedLocation.latitude.toPrecision(5)}
                    {"\n"}
                    {"Longitude: "}
                    {selectedLocation.longitude.toPrecision(5)}
                  </themed_1.Text>
                  <themed_1.Text style={[styles.cardDescription, { color: colors._blue }]} onPress={openInGoogleMaps}>
                    {LL.MapScreen.viewInGoogleMaps()}
                  </themed_1.Text>
                </react_native_1.View>)}

              <themed_1.Input placeholder="Business Name" value={businessName} onChangeText={setBusinessName} containerStyle={styles.marginBottom}/>
              <themed_1.Text style={styles.cardDescription} type="p2">
                {LL.MerchantSuggestModal.learnMore()}
              </themed_1.Text>
              <react_native_1.View style={styles.cardActionsContainer}>
                <galoy_primary_button_1.GaloyPrimaryButton style={styles.marginBottom} title={LL.common.request()} onPress={onSubmit}/>
                <galoy_secondary_button_1.GaloySecondaryButton title={LL.common.cancel()} onPress={closeModal}/>
              </react_native_1.View>
            </react_native_1.View>
          </react_native_1.TouchableWithoutFeedback>
        </react_native_1.ScrollView>
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.MerchantSuggestModal = MerchantSuggestModal;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    stableSatsImage: {
        width: "100%",
        height: 75,
        marginBottom: 8,
    },
    scrollViewStyle: {
        paddingHorizontal: 12,
    },
    modalCard: {
        backgroundColor: colors.white,
        borderRadius: 16,
        paddingVertical: 18,
        marginVertical: 50,
    },
    cardTitle: {
        textAlign: "center",
        marginBottom: 16,
    },
    cardDescription: {
        marginBottom: 12,
    },
    cardActionsContainer: {
        flexDirection: "column",
        paddingVertical: 12,
    },
    marginBottom: {
        marginBottom: 12,
    },
    topScreen: {
        justifyContent: "flex-start",
        margin: 0,
    },
}));
//# sourceMappingURL=merchant-suggest-modal.js.map