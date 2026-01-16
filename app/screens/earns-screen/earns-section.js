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
exports.EarnSection = void 0;
const native_1 = require("@react-navigation/native");
const base_1 = require("@rneui/base");
const React = __importStar(require("react"));
const react_1 = require("react");
const react_native_1 = require("react-native");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const react_native_reanimated_carousel_1 = __importDefault(require("react-native-reanimated-carousel"));
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const pagination_1 = require("@app/components/pagination");
const level_context_1 = require("@app/graphql/level-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const react_native_reanimated_1 = require("react-native-reanimated");
const screen_1 = require("../../components/screen");
const use_quiz_server_1 = require("../earns-map-screen/use-quiz-server");
const earn_svg_factory_1 = require("./earn-svg-factory");
const earns_utils_1 = require("./earns-utils");
const themed_1 = require("@rneui/themed");
const { width: screenWidth } = react_native_1.Dimensions.get("window");
const svgWidth = screenWidth;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        alignItems: "center",
    },
    buttonStyleDisabled: {
        backgroundColor: colors._white,
        borderRadius: 24,
        marginHorizontal: 60,
        marginVertical: 32,
        opacity: 0.5,
    },
    buttonStyleFulfilled: {
        backgroundColor: colors.transparent,
        borderRadius: 24,
        marginHorizontal: 60,
        marginVertical: 32,
    },
    icon: { paddingRight: 12, paddingTop: 3 },
    item: {
        backgroundColor: colors._green,
        borderRadius: 16,
        width: svgWidth,
    },
    itemTitle: {
        color: colors._white,
        fontSize: 20,
        fontWeight: "bold",
        height: 72,
        marginHorizontal: 24,
        textAlign: "center",
    },
    svgContainer: { paddingVertical: 12 },
    textButton: {
        backgroundColor: colors._white,
        borderRadius: 24,
        marginHorizontal: 60,
        marginVertical: 32,
    },
    titleStyle: {
        color: colors._green,
        fontWeight: "bold",
    },
    titleStyleDisabled: {
        color: colors._darkGrey,
    },
    titleStyleFulfilled: {
        color: colors._white,
    },
    unlock: {
        alignSelf: "center",
        color: colors._black,
        fontSize: 16,
        fontWeight: "bold",
        textAlign: "center",
    },
    unlockQuestion: {
        alignSelf: "center",
        color: colors._black,
        fontSize: 16,
        paddingTop: 18,
    },
    paginationContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        width: 100,
        alignSelf: "center",
        position: "absolute",
        bottom: 40,
    },
}));
const convertToQuizQuestionForSectionScreen = (cards) => {
    let allPreviousFulfilled = true;
    let nonEnabledMessage = "";
    return cards.map((card) => {
        const newCard = Object.assign(Object.assign({}, card), { enabled: allPreviousFulfilled, nonEnabledMessage });
        if (!newCard.completed && allPreviousFulfilled) {
            allPreviousFulfilled = false;
            nonEnabledMessage = newCard.title;
        }
        return newCard;
    });
};
const EarnSection = ({ route }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const { isAtLeastLevelOne } = (0, level_context_1.useLevel)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const quizQuestionsContent = (0, earns_utils_1.getQuizQuestionsContent)({ LL });
    const { quizServerData } = (0, use_quiz_server_1.useQuizServer)();
    const section = route.params.section;
    const cardsOnSection = (0, earns_utils_1.getCardsFromSection)({
        section,
        quizQuestionsContent,
    });
    const cards = convertToQuizQuestionForSectionScreen(cardsOnSection.map((card) => (0, earns_utils_1.augmentCardWithGqlData)({ card, quizServerData })));
    const itemIndex = cards.findIndex((item) => !item.completed);
    const [firstItem] = (0, react_1.useState)(itemIndex >= 0 ? itemIndex : 0);
    const progressValue = (0, react_native_reanimated_1.useSharedValue)(0);
    const isCompleted = cards.every((item) => item.completed);
    const [initialIsCompleted] = (0, react_1.useState)(isCompleted);
    const sectionTitle = LL.EarnScreen.earnSections[section].title();
    const isFocused = (0, native_1.useIsFocused)();
    if (initialIsCompleted === false && isCompleted && isFocused) {
        navigation.navigate("sectionCompleted", {
            amount: cards.reduce((acc, item) => item.amount + acc, 0),
            sectionTitle,
        });
    }
    React.useEffect(() => {
        navigation.setOptions({ title: sectionTitle });
    }, [navigation, sectionTitle]);
    const open = async (id) => {
        if (!isAtLeastLevelOne) {
            react_native_1.Alert.alert(LL.EarnScreen.registerTitle(), LL.EarnScreen.registerContent(), [
                {
                    text: LL.common.cancel(),
                    onPress: () => console.log("Cancel Pressed"),
                    style: "cancel",
                },
                { text: "OK", onPress: () => navigation.navigate("phoneFlow") },
            ]);
            return;
        }
        navigation.navigate("earnsQuiz", { id });
    };
    const CardItem = ({ item }) => {
        return (<>
        <react_native_1.View style={styles.item}>
          <react_native_gesture_handler_1.TouchableOpacity onPress={() => open(item.id)} activeOpacity={0.9} disabled={!item.enabled}>
            <react_native_1.View style={styles.svgContainer}>
              {(0, earn_svg_factory_1.SVGs)({ name: item.id, width: svgWidth })}
            </react_native_1.View>
          </react_native_gesture_handler_1.TouchableOpacity>
          <react_native_1.View>
            <react_native_1.Text style={styles.itemTitle} numberOfLines={3}>
              {item.title}
            </react_native_1.Text>
            <base_1.Button onPress={() => open(item.id)} disabled={!item.enabled} disabledStyle={styles.buttonStyleDisabled} disabledTitleStyle={styles.titleStyleDisabled} buttonStyle={item.completed ? styles.buttonStyleFulfilled : styles.textButton} titleStyle={item.completed ? styles.titleStyleFulfilled : styles.titleStyle} title={item.completed
                ? LL.EarnScreen.satsEarned({ formattedNumber: item.amount })
                : LL.EarnScreen.earnSats({ formattedNumber: item.amount })} icon={item.completed ? (<Ionicons_1.default name="checkmark-circle-outline" size={36} color={colors._white} style={styles.icon}/>) : undefined}/>
          </react_native_1.View>
        </react_native_1.View>
        {!item.enabled && (<>
            <react_native_1.Text style={styles.unlockQuestion}>{LL.EarnScreen.unlockQuestion()}</react_native_1.Text>
            <react_native_1.Text style={styles.unlock}>{item.nonEnabledMessage}</react_native_1.Text>
          </>)}
      </>);
    };
    return (<screen_1.Screen backgroundColor={colors._gold} statusBar="light-content">
      <react_native_1.View style={styles.container}>
        <react_native_reanimated_carousel_1.default data={cards} renderItem={CardItem} width={screenWidth} mode="parallax" defaultIndex={firstItem} loop={false} modeConfig={{
            parallaxScrollingScale: 0.82,
            parallaxScrollingOffset: 80,
        }} onProgressChange={(_, absoluteProgress) => (progressValue.value = absoluteProgress)}/>
        {Boolean(progressValue) && (<react_native_1.View style={styles.paginationContainer}>
            {cards.map((_, index) => {
                return (<pagination_1.PaginationItem backgroundColor={"grey"} animValue={progressValue} index={index} key={index} length={cards.length}/>);
            })}
          </react_native_1.View>)}
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.EarnSection = EarnSection;
//# sourceMappingURL=earns-section.js.map