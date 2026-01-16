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
exports.ModalTooltip = void 0;
const i18n_react_1 = require("@app/i18n/i18n-react");
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const hooks_1 = require("@app/hooks");
const themed_1 = require("@rneui/themed");
const ModalTooltip = ({ size, type, title, text, }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { appConfig: { galoyInstance: { name: bankName }, }, } = (0, hooks_1.useAppConfig)();
    const [isVisible, setIsVisible] = React.useState(false);
    const toggleModal = () => setIsVisible(!isVisible);
    const styles = useStyles();
    let iconParams;
    let defaultTitle;
    switch (type) {
        case "info":
            iconParams = {
                name: "information-circle-outline",
                type: "ionicons",
            };
            defaultTitle = LL.common.bankInfo({ bankName });
            break;
        case "advice":
            iconParams = {
                name: "bulb-outline",
                type: "ionicon",
            };
            defaultTitle = LL.common.bankAdvice({ bankName });
            break;
    }
    const modalTitle = title || defaultTitle;
    return (<>
      <Ionicons_1.default color={type === "info" ? colors.black : colors.error} size={size} {...iconParams} onPress={toggleModal}/>
      <react_native_modal_1.default isVisible={isVisible} onBackdropPress={toggleModal} coverScreen style={styles.modalStyle} backdropOpacity={0.3} backdropColor={colors.grey3}>
        <react_native_1.TouchableOpacity style={styles.fillerOpacity} onPress={toggleModal}/>
        <react_native_1.View style={styles.modalCard}>
          <react_native_1.View style={styles.modalTitleContainer}>
            <Ionicons_1.default size={24} {...iconParams} style={styles.iconContainer}/>
            <themed_1.Text type={"h1"}>{modalTitle}</themed_1.Text>
          </react_native_1.View>
          <react_native_1.ScrollView>
            <themed_1.Text type={"p1"}>{text}</themed_1.Text>
          </react_native_1.ScrollView>
        </react_native_1.View>
      </react_native_modal_1.default>
    </>);
};
exports.ModalTooltip = ModalTooltip;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    modalStyle: {
        margin: 0,
        flexDirection: "column",
        justifyContent: "flex-end",
    },
    fillerOpacity: {
        flex: 1,
    },
    modalCard: {
        backgroundColor: colors.white,
        maxFlex: 2,
        borderTopLeftRadius: 40,
        borderTopRightRadius: 40,
        padding: 24,
    },
    modalTitleContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },
    iconContainer: {
        color: colors.black,
        marginRight: 12,
    },
}));
//# sourceMappingURL=modal-tooltip.js.map