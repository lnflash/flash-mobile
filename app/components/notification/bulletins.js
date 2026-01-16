"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulletinsCard = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const _1 = require(".");
const notification_card_ui_1 = require("./notification-card-ui");
const generated_1 = require("@app/graphql/generated");
const config_1 = require("@app/config");
const BulletinsCard = ({ loading, bulletins }) => {
    var _a, _b, _c, _d, _e, _f;
    const { cardInfo } = (0, _1.useNotifications)();
    const [ack, { loading: ackLoading }] = (0, generated_1.useStatefulNotificationAcknowledgeMutation)({
        refetchQueries: [generated_1.BulletinsDocument],
    });
    if (loading)
        return null;
    if (bulletins &&
        ((_b = (_a = bulletins.me) === null || _a === void 0 ? void 0 : _a.unacknowledgedStatefulNotificationsWithBulletinEnabled) === null || _b === void 0 ? void 0 : _b.edges) &&
        ((_d = (_c = bulletins.me) === null || _c === void 0 ? void 0 : _c.unacknowledgedStatefulNotificationsWithBulletinEnabled) === null || _d === void 0 ? void 0 : _d.edges.length) > 0) {
        return (<>
        {(_f = (_e = bulletins.me) === null || _e === void 0 ? void 0 : _e.unacknowledgedStatefulNotificationsWithBulletinEnabled) === null || _f === void 0 ? void 0 : _f.edges.map(({ node: bulletin }) => (<notification_card_ui_1.NotificationCardUI icon={bulletin.icon
                    ? bulletin.icon.toLowerCase().replace("_", "-")
                    : undefined} key={bulletin.id} title={bulletin.title} text={bulletin.body} action={async () => {
                    var _a, _b;
                    ack({ variables: { input: { notificationId: bulletin.id } } });
                    if (((_a = bulletin.action) === null || _a === void 0 ? void 0 : _a.__typename) === "OpenDeepLinkAction")
                        react_native_1.Linking.openURL(config_1.FLASH_DEEP_LINK_PREFIX + bulletin.action.deepLink);
                    else if (((_b = bulletin.action) === null || _b === void 0 ? void 0 : _b.__typename) === "OpenExternalLinkAction")
                        react_native_1.Linking.openURL(bulletin.action.url);
                }} dismissAction={() => ack({ variables: { input: { notificationId: bulletin.id } } })} loading={ackLoading}/>))}
      </>);
    }
    if (!cardInfo) {
        return null;
    }
    return (<notification_card_ui_1.NotificationCardUI title={cardInfo.title} text={cardInfo.text} icon={cardInfo.icon} action={cardInfo.action} loading={cardInfo.loading} dismissAction={cardInfo.dismissAction}/>);
};
exports.BulletinsCard = BulletinsCard;
//# sourceMappingURL=bulletins.js.map