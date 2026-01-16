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
exports.useNotifications = exports.NotificationsProvider = exports.NotificationModalContext = void 0;
const react_1 = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const galoy_icon_1 = require("../atomic/galoy-icon");
const custom_modal_1 = __importDefault(require("../custom-modal/custom-modal"));
exports.NotificationModalContext = (0, react_1.createContext)({
    notifyModal: () => { },
    notifyCard: () => { },
    cardInfo: undefined,
});
const NotificationsProvider = ({ children, }) => {
    const [modalNotifications, setModalNotifications] = (0, react_1.useState)([]);
    const [modalPrimaryIsLoading, setModalPrimaryIsLoading] = (0, react_1.useState)(false);
    const [modalSecondaryIsLoading, setModalSecondaryIsLoading] = (0, react_1.useState)(false);
    const [cardNotifications, setCardNotifications] = (0, react_1.useState)([]);
    const [cardIsLoading, setCardIsLoading] = (0, react_1.useState)(false);
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    const notifyModal = (0, react_1.useCallback)((args) => {
        setModalNotifications((notifications) => [...notifications, args]);
    }, [setModalNotifications]);
    const dismissModal = (0, react_1.useCallback)(() => {
        setModalNotifications((notifications) => notifications.slice(1));
    }, [setModalNotifications]);
    const notifyCard = (0, react_1.useCallback)((args) => {
        setCardNotifications((notifications) => [...notifications, args]);
    }, [setCardNotifications]);
    const dismissCard = (0, react_1.useCallback)(() => {
        setCardNotifications((notifications) => notifications.slice(1));
    }, [setCardNotifications]);
    const activeCard = cardNotifications[0];
    const activeNotification = modalNotifications[0];
    const modalInfo = (0, react_1.useMemo)(() => {
        if (!activeNotification) {
            return null;
        }
        const toggleModal = () => {
            dismissModal();
            if (activeNotification.dismissAction) {
                activeNotification.dismissAction();
            }
        };
        const primaryButtonAction = async () => {
            if (activeNotification.primaryButtonAction) {
                setModalPrimaryIsLoading(true);
                await activeNotification.primaryButtonAction();
                setModalPrimaryIsLoading(false);
            }
            dismissModal();
        };
        const secondaryButtonAction = async () => {
            if (activeNotification.secondaryButtonAction) {
                setModalSecondaryIsLoading(true);
                await activeNotification.secondaryButtonAction();
                setModalSecondaryIsLoading(false);
            }
            dismissModal();
        };
        return {
            title: activeNotification.title,
            isVisible: Boolean(activeNotification),
            toggleModal,
            showCloseIcon: Boolean(activeNotification.dismissAction),
            primaryButtonTitle: activeNotification.primaryButtonTitle,
            primaryButtonAction,
            secondaryButtonTitle: activeNotification.secondaryButtonTitle,
            secondaryButtonAction,
            text: activeNotification.text,
            icon: activeNotification.icon,
        };
    }, [
        activeNotification,
        dismissModal,
        setModalPrimaryIsLoading,
        setModalSecondaryIsLoading,
    ]);
    const cardInfo = (0, react_1.useMemo)(() => {
        if (!activeCard) {
            return undefined;
        }
        const action = async () => {
            setCardIsLoading(true);
            await activeCard.action();
            dismissCard();
            setCardIsLoading(false);
        };
        const dismissAction = () => {
            dismissCard();
            if (activeCard.dismissAction) {
                activeCard.dismissAction();
            }
        };
        return {
            title: activeCard.title,
            text: activeCard.text,
            icon: activeCard.icon,
            action,
            loading: cardIsLoading,
            dismissAction,
        };
    }, [activeCard, dismissCard, cardIsLoading]);
    return (<exports.NotificationModalContext.Provider value={{
            notifyModal,
            notifyCard,
            cardInfo,
        }}>
      {children}

      {modalInfo && (<custom_modal_1.default isVisible={modalInfo.isVisible} toggleModal={modalInfo.toggleModal} title={modalInfo.title} showCloseIconButton={modalInfo.showCloseIcon} primaryButtonTitle={modalInfo.primaryButtonTitle} primaryButtonOnPress={modalInfo.primaryButtonAction} primaryButtonLoading={modalPrimaryIsLoading} secondaryButtonOnPress={modalInfo.secondaryButtonAction} secondaryButtonTitle={modalInfo.secondaryButtonTitle} secondaryButtonLoading={modalSecondaryIsLoading} image={modalInfo.icon && (<galoy_icon_1.GaloyIcon name={modalInfo.icon} size={100} color={colors.primary3}/>)} body={<themed_1.Text type="h2" style={styles.bodyText}>
              {modalInfo.text}
            </themed_1.Text>}/>)}
    </exports.NotificationModalContext.Provider>);
};
exports.NotificationsProvider = NotificationsProvider;
const useStyles = (0, themed_1.makeStyles)(() => ({
    bodyText: {
        textAlign: "center",
    },
}));
const useNotifications = () => (0, react_1.useContext)(exports.NotificationModalContext);
exports.useNotifications = useNotifications;
//# sourceMappingURL=notification.js.map