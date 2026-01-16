"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GaloyIcon = exports.circleDiameterThatContainsSquare = exports.IconNames = exports.icons = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const arrow_left_svg_1 = __importDefault(require("@app/assets/icons-redesign/arrow-left.svg"));
const arrow_right_svg_1 = __importDefault(require("@app/assets/icons-redesign/arrow-right.svg"));
const back_space_svg_1 = __importDefault(require("@app/assets/icons-redesign/back-space.svg"));
const bank_svg_1 = __importDefault(require("@app/assets/icons-redesign/bank.svg"));
const bell_svg_1 = __importDefault(require("@app/assets/icons-redesign/bell.svg"));
const bitcoin_svg_1 = __importDefault(require("@app/assets/icons-redesign/bitcoin.svg"));
const book_svg_1 = __importDefault(require("@app/assets/icons-redesign/book.svg"));
const btc_book_svg_1 = __importDefault(require("@app/assets/icons-redesign/btc-book.svg"));
const caret_down_svg_1 = __importDefault(require("@app/assets/icons-redesign/caret-down.svg"));
const caret_left_svg_1 = __importDefault(require("@app/assets/icons-redesign/caret-left.svg"));
const caret_right_svg_1 = __importDefault(require("@app/assets/icons-redesign/caret-right.svg"));
const caret_up_svg_1 = __importDefault(require("@app/assets/icons-redesign/caret-up.svg"));
const check_circle_svg_1 = __importDefault(require("@app/assets/icons-redesign/check-circle.svg"));
const check_svg_1 = __importDefault(require("@app/assets/icons-redesign/check.svg"));
const close_svg_1 = __importDefault(require("@app/assets/icons-redesign/close.svg"));
const close_cross_with_background_svg_1 = __importDefault(require("@app/assets/icons-redesign/close-cross-with-background.svg"));
const coins_svg_1 = __importDefault(require("@app/assets/icons-redesign/coins.svg"));
const contact_svg_1 = __importDefault(require("@app/assets/icons-redesign/contact.svg"));
const copy_paste_svg_1 = __importDefault(require("@app/assets/icons-redesign/copy-paste.svg"));
const dollar_svg_1 = __importDefault(require("@app/assets/icons-redesign/dollar.svg"));
const eye_slash_svg_1 = __importDefault(require("@app/assets/icons-redesign/eye-slash.svg"));
const eye_svg_1 = __importDefault(require("@app/assets/icons-redesign/eye.svg"));
const filter_svg_1 = __importDefault(require("@app/assets/icons-redesign/filter.svg"));
const gear_svg_1 = __importDefault(require("@app/assets/icons-redesign/gear.svg"));
const globe_svg_1 = __importDefault(require("@app/assets/icons-redesign/globe.svg"));
const graph_svg_1 = __importDefault(require("@app/assets/icons-redesign/graph.svg"));
const image_svg_1 = __importDefault(require("@app/assets/icons-redesign/image.svg"));
const info_svg_1 = __importDefault(require("@app/assets/icons-redesign/info.svg"));
const lightning_svg_1 = __importDefault(require("@app/assets/icons-redesign/lightning.svg"));
const link_svg_1 = __importDefault(require("@app/assets/icons-redesign/link.svg"));
const loading_svg_1 = __importDefault(require("@app/assets/icons-redesign/loading.svg"));
const magnifying_glass_svg_1 = __importDefault(require("@app/assets/icons-redesign/magnifying-glass.svg"));
const map_svg_1 = __importDefault(require("@app/assets/icons-redesign/map.svg"));
const menu_svg_1 = __importDefault(require("@app/assets/icons-redesign/menu.svg"));
const pencil_svg_1 = __importDefault(require("@app/assets/icons-redesign/pencil.svg"));
const qr_code_svg_1 = __importDefault(require("@app/assets/icons-redesign/qr-code.svg"));
const question_svg_1 = __importDefault(require("@app/assets/icons-redesign/question.svg"));
const receive_svg_1 = __importDefault(require("@app/assets/icons-redesign/receive.svg"));
const send_svg_1 = __importDefault(require("@app/assets/icons-redesign/send.svg"));
const settings_svg_1 = __importDefault(require("@app/assets/icons-redesign/settings.svg"));
const share_svg_1 = __importDefault(require("@app/assets/icons-redesign/share.svg"));
const transfer_svg_1 = __importDefault(require("@app/assets/icons-redesign/transfer.svg"));
const user_svg_1 = __importDefault(require("@app/assets/icons-redesign/user.svg"));
const video_svg_1 = __importDefault(require("@app/assets/icons-redesign/video.svg"));
const warning_svg_1 = __importDefault(require("@app/assets/icons-redesign/warning.svg"));
const warning_with_background_svg_1 = __importDefault(require("@app/assets/icons-redesign/warning-with-background.svg"));
const payment_success_svg_1 = __importDefault(require("@app/assets/icons-redesign/payment-success.svg"));
const payment_pending_svg_1 = __importDefault(require("@app/assets/icons-redesign/payment-pending.svg"));
const payment_error_svg_1 = __importDefault(require("@app/assets/icons-redesign/payment-error.svg"));
const note_svg_1 = __importDefault(require("@app/assets/icons/note.svg"));
const people_svg_1 = __importDefault(require("@app/assets/icons/people.svg"));
const rank_svg_1 = __importDefault(require("@app/assets/icons/rank.svg"));
const refresh_svg_1 = __importDefault(require("@app/assets/icons/refresh.svg"));
const send_success_svg_1 = __importDefault(require("@app/assets/icons-redesign/send-success.svg"));
const themed_1 = require("@rneui/themed");
exports.icons = {
    "arrow-right": arrow_right_svg_1.default,
    "arrow-left": arrow_left_svg_1.default,
    "back-space": back_space_svg_1.default,
    "bank": bank_svg_1.default,
    "bitcoin": bitcoin_svg_1.default,
    "book": book_svg_1.default,
    "btc-book": btc_book_svg_1.default,
    "caret-down": caret_down_svg_1.default,
    "caret-left": caret_left_svg_1.default,
    "caret-right": caret_right_svg_1.default,
    "caret-up": caret_up_svg_1.default,
    "check-circle": check_circle_svg_1.default,
    "check": check_svg_1.default,
    "close": close_svg_1.default,
    "close-cross-with-background": close_cross_with_background_svg_1.default,
    "coins": coins_svg_1.default,
    "people": people_svg_1.default,
    "contact": contact_svg_1.default,
    "copy-paste": copy_paste_svg_1.default,
    "dollar": dollar_svg_1.default,
    "eye-slash": eye_slash_svg_1.default,
    "eye": eye_svg_1.default,
    "filter": filter_svg_1.default,
    "gear": gear_svg_1.default,
    "globe": globe_svg_1.default,
    "graph": graph_svg_1.default,
    "image": image_svg_1.default,
    "info": info_svg_1.default,
    "lightning": lightning_svg_1.default,
    "link": link_svg_1.default,
    "loading": loading_svg_1.default,
    "magnifying-glass": magnifying_glass_svg_1.default,
    "map": map_svg_1.default,
    "menu": menu_svg_1.default,
    "pencil": pencil_svg_1.default,
    "note": note_svg_1.default,
    "rank": rank_svg_1.default,
    "qr-code": qr_code_svg_1.default,
    "question": question_svg_1.default,
    "receive": receive_svg_1.default,
    "send": send_svg_1.default,
    "settings": settings_svg_1.default,
    "share": share_svg_1.default,
    "transfer": transfer_svg_1.default,
    "user": user_svg_1.default,
    "video": video_svg_1.default,
    "warning": warning_svg_1.default,
    "warning-with-background": warning_with_background_svg_1.default,
    "payment-success": payment_success_svg_1.default,
    "payment-pending": payment_pending_svg_1.default,
    "payment-error": payment_error_svg_1.default,
    "bell": bell_svg_1.default,
    "refresh": refresh_svg_1.default,
    "send-success": send_success_svg_1.default,
};
exports.IconNames = Object.keys(exports.icons);
const circleDiameterThatContainsSquare = (squareSize) => {
    const SQRT2 = 1.414;
    return Math.round(squareSize * SQRT2);
};
exports.circleDiameterThatContainsSquare = circleDiameterThatContainsSquare;
const GaloyIcon = ({ name, size, color, style, backgroundColor, opacity, }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles({ backgroundColor, opacity, size });
    const Icon = exports.icons[name];
    return backgroundColor ? (<react_native_1.View style={[style, styles.iconContainerStyle]}>
      <Icon width={size} opacity={opacity || 1} height={size} color={color || colors.black} fontWeight={"600"}/>
    </react_native_1.View>) : (<Icon opacity={opacity || 1} width={size} height={size} color={color || colors.black} style={style} fontWeight={"600"}/>);
};
exports.GaloyIcon = GaloyIcon;
const useStyles = (0, themed_1.makeStyles)((_, { backgroundColor, opacity, size }) => {
    const containerSize = (0, exports.circleDiameterThatContainsSquare)(size);
    return {
        iconContainerStyle: {
            opacity: opacity || 1,
            backgroundColor,
            borderRadius: containerSize,
            width: containerSize,
            height: containerSize,
            alignItems: "center",
            justifyContent: "center",
        },
    };
});
//# sourceMappingURL=galoy-icon.js.map