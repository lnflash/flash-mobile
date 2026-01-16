"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const themed_1 = require("@rneui/themed");
const galoy_icon_1 = require("../atomic/galoy-icon");
const buttons_1 = require("../buttons");
const CustomModal = ({ isVisible, toggleModal, image, title, body, minHeight, titleMaxWidth, titleTextAlignment, primaryButtonTitle, nonScrollingContent, primaryButtonOnPress, primaryButtonTextAbove, primaryButtonLoading, primaryButtonDisabled, secondaryButtonTitle, secondaryButtonOnPress, secondaryButtonLoading, showCloseIconButton = true, }) => {
    const styles = useStyles({
        hasPrimaryButtonTextAbove: Boolean(primaryButtonTextAbove),
        minHeight,
        titleMaxWidth,
        titleTextAlignment,
        showCloseIconButton,
        /* eslint @typescript-eslint/ban-ts-comment: "off" */
        // @ts-ignore-next-line no-implicit-any error
    });
    const { theme: { mode, colors }, } = (0, themed_1.useTheme)();
    return (<react_native_modal_1.default isVisible={isVisible} backdropOpacity={0.8} backdropColor={colors.white} backdropTransitionOutTiming={0} avoidKeyboard={true} onBackdropPress={toggleModal}>
      <react_native_1.View style={styles.container}>
        {showCloseIconButton && (<react_native_1.TouchableOpacity style={styles.closeIcon} onPress={toggleModal}>
            <galoy_icon_1.GaloyIcon name="close" size={30} color={colors.grey0}/>
          </react_native_1.TouchableOpacity>)}
        <react_native_gesture_handler_1.ScrollView style={styles.modalCard} persistentScrollbar={true} indicatorStyle={mode === "dark" ? "white" : "black"} bounces={false} contentContainerStyle={styles.scrollViewContainer}>
          {image && <react_native_1.View style={styles.imageContainer}>{image}</react_native_1.View>}
          <react_native_1.View style={styles.modalTitleContainer}>
            <themed_1.Text style={styles.modalTitleText}>{title}</themed_1.Text>
          </react_native_1.View>
          <react_native_1.View style={styles.modalBodyContainer}>{body}</react_native_1.View>
        </react_native_gesture_handler_1.ScrollView>
        {nonScrollingContent}
        <react_native_1.View style={styles.modalActionsContainer}>
          <react_native_1.View>
            {primaryButtonTextAbove && (<themed_1.Text style={styles.primaryButtonTextAbove} type="p3">
                {primaryButtonTextAbove}
              </themed_1.Text>)}
            <buttons_1.PrimaryBtn label={primaryButtonTitle} onPress={primaryButtonOnPress} loading={primaryButtonLoading} disabled={primaryButtonDisabled}/>
          </react_native_1.View>
          {secondaryButtonTitle && secondaryButtonOnPress && (<buttons_1.PrimaryBtn type="outline" label={secondaryButtonTitle} loading={secondaryButtonLoading} onPress={secondaryButtonOnPress}/>)}
        </react_native_1.View>
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.default = CustomModal;
const useStyles = (0, themed_1.makeStyles)(({ colors }, props) => ({
    container: {
        backgroundColor: colors.grey5,
        maxHeight: "95%",
        minHeight: props.minHeight || "auto",
        borderRadius: 16,
        padding: 20,
    },
    modalCard: {
        width: "100%",
    },
    imageContainer: {
        justifyContent: "center",
        alignItems: "center",
        paddingBottom: 20,
        paddingTop: props.showCloseIconButton ? 0 : 20,
    },
    modalTitleContainer: {
        justifyContent: "center",
        alignItems: "center",
        paddingBottom: 10,
    },
    modalTitleText: {
        fontSize: 24,
        fontWeight: react_native_1.Platform.OS === "ios" ? "600" : "700",
        lineHeight: 32,
        maxWidth: props.titleMaxWidth || "80%",
        textAlign: props.titleTextAlignment || "center",
        color: colors.black,
    },
    modalBodyContainer: {
        flex: 1,
        flexGrow: 1,
    },
    scrollViewContainer: { flexGrow: 1 },
    modalBodyText: {
        fontSize: 20,
        fontWeight: "400",
        lineHeight: 24,
        textAlign: "center",
        maxWidth: "80%",
    },
    primaryButtonTextAbove: {
        textAlign: "center",
        paddingVertical: 8,
    },
    modalActionsContainer: {
        width: "100%",
        height: "auto",
        flexDirection: "column",
        rowGap: 12,
        marginTop: props.hasPrimaryButtonTextAbove ? 0 : 20,
    },
    closeIcon: {
        width: "100%",
        justifyContent: "flex-end",
        alignItems: "flex-end",
    },
}));
//# sourceMappingURL=custom-modal.js.map