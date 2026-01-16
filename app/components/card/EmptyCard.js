"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// components
const buttons_1 = require("../buttons");
// hooks
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
// assets
const empty_flashcard_svg_1 = __importDefault(require("@app/assets/icons/empty-flashcard.svg"));
const width = react_native_1.Dimensions.get("screen").width;
const EmptyCard = () => {
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { readFlashcard } = (0, hooks_1.useFlashcard)();
    const findFlashpoint = () => navigation.navigate("Map");
    return (<react_native_1.View style={styles.container}>
      <react_native_1.View style={styles.top}>
        <themed_1.Text type="h03" bold>
          {LL.CardScreen.noCardsTitle()}
        </themed_1.Text>
        <themed_1.Text type="h01">{LL.CardScreen.noCardsYet()}</themed_1.Text>
        <empty_flashcard_svg_1.default height={width / 1.2} width={width / 1.2} style={styles.card}/>
      </react_native_1.View>
      <buttons_1.PrimaryBtn label="Read NFC card" onPress={() => readFlashcard(false)} btnStyle={{ marginBottom: 10 }}/>
      <buttons_1.PrimaryBtn type="outline" label="Find a Flashpoint" onPress={findFlashpoint}/>
    </react_native_1.View>);
};
exports.default = EmptyCard;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingBottom: 10,
    },
    top: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    card: {
        marginVertical: 20,
    },
}));
//# sourceMappingURL=EmptyCard.js.map