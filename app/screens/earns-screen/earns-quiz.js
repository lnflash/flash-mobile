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
exports.EarnQuiz = void 0;
/* eslint-disable react-native/no-inline-styles */
const base_1 = require("@rneui/base");
const React = __importStar(require("react"));
const react_1 = require("react");
const react_native_1 = require("react-native");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const utils_1 = require("@app/graphql/utils");
const i18n_react_1 = require("@app/i18n/i18n-react");
const toast_1 = require("@app/utils/toast");
const native_1 = require("@react-navigation/native");
const close_cross_1 = require("../../components/close-cross");
const screen_1 = require("../../components/screen");
const helper_1 = require("../../utils/helper");
const sleep_1 = require("../../utils/sleep");
const earn_svg_factory_1 = require("./earn-svg-factory");
const earns_utils_1 = require("./earns-utils");
const use_quiz_server_1 = require("../earns-map-screen/use-quiz-server");
const themed_1 = require("@rneui/themed");
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    answersView: {
        flex: 1,
        marginHorizontal: 48,
        marginTop: 6,
    },
    bottomContainer: {
        alignItems: "center",
        backgroundColor: colors._white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 0,
        shadowColor: colors.grey2,
        shadowOpacity: 5,
        shadowRadius: 8,
    },
    buttonStyle: {
        backgroundColor: colors._lightBlue,
        borderRadius: 32,
        width: 224,
    },
    completedTitleStyle: {
        color: colors._lightBlue,
        fontSize: 18,
        fontWeight: "bold",
    },
    correctAnswerText: {
        color: colors.green,
        fontSize: 16,
    },
    incorrectAnswerText: {
        color: colors.error,
        fontSize: 16,
    },
    keepDiggingContainerStyle: {
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 24,
        marginTop: 18,
        minHeight: 18,
    },
    modalBackground: {
        alignItems: "center",
        backgroundColor: colors._white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        justifyContent: "flex-end",
        minHeight: 630,
    },
    quizButtonContainerStyle: {
        marginVertical: 12,
        width: 48,
    },
    quizButtonStyle: {
        backgroundColor: colors._lightBlue,
        borderRadius: 32,
        padding: 12,
    },
    quizButtonTitleStyle: {
        color: colors._white,
        fontWeight: "bold",
    },
    quizCorrectButtonStyle: {
        backgroundColor: colors.green,
        borderRadius: 32,
        padding: 12,
    },
    quizTextAnswer: {
        color: colors._darkGrey,
        textAlign: "left",
        width: "100%",
    },
    quizTextContainerStyle: {
        alignItems: "flex-start",
        marginLeft: 12,
        marginRight: 36,
    },
    quizWrongButtonStyle: {
        backgroundColor: colors.error,
        borderRadius: 32,
        padding: 12,
    },
    svgContainer: {
        alignItems: "center",
        paddingVertical: 16,
    },
    text: {
        fontSize: 24,
    },
    textContainer: {
        marginHorizontal: 24,
        paddingBottom: 48,
    },
    textEarn: {
        color: colors._darkGrey,
        fontSize: 16,
        fontWeight: "bold",
    },
    title: {
        fontSize: 32,
        fontWeight: "bold",
        paddingBottom: 12,
    },
    titleStyle: {
        color: colors._white,
        fontSize: 18,
        fontWeight: "bold",
    },
}));
const mappingLetter = { 0: "A", 1: "B", 2: "C" };
(0, client_1.gql) `
  mutation quizCompleted($input: QuizCompletedInput!) {
    quizCompleted(input: $input) {
      errors {
        message
      }
      quiz {
        id
        completed
      }
    }
  }
`;
const EarnQuiz = ({ route }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const quizQuestionsContent = (0, earns_utils_1.getQuizQuestionsContent)({ LL });
    const navigation = (0, native_1.useNavigation)();
    const [permutation] = (0, react_1.useState)((0, helper_1.shuffle)([0, 1, 2]));
    const { quizServerData } = (0, use_quiz_server_1.useQuizServer)();
    const { id } = route.params;
    const allCards = React.useMemo(() => quizQuestionsContent.map((item) => item.content).flatMap((item) => item), [quizQuestionsContent]);
    const cardNoMetadata = React.useMemo(() => allCards.find((item) => item.id === id), [allCards, id]);
    if (!cardNoMetadata) {
        // should never happen
        throw new Error("card not found");
    }
    const card = (0, earns_utils_1.augmentCardWithGqlData)({ card: cardNoMetadata, quizServerData });
    const { title, text, amount, answers, feedback, question, completed } = card;
    const [quizCompleted] = (0, generated_1.useQuizCompletedMutation)();
    const [quizVisible, setQuizVisible] = (0, react_1.useState)(false);
    const [recordedAnswer, setRecordedAnswer] = (0, react_1.useState)([]);
    const addRecordedAnswer = (value) => {
        setRecordedAnswer([...recordedAnswer, value]);
    };
    const answersShuffled = [];
    (0, react_1.useEffect)(() => {
        ;
        (async () => {
            var _a, _b;
            if (recordedAnswer.indexOf(0) !== -1) {
                const { data } = await quizCompleted({
                    variables: { input: { id } },
                });
                if ((_b = (_a = data === null || data === void 0 ? void 0 : data.quizCompleted) === null || _a === void 0 ? void 0 : _a.errors) === null || _b === void 0 ? void 0 : _b.length) {
                    // FIXME: message is hidden by the modal
                    (0, toast_1.toastShow)({
                        message: (0, utils_1.getErrorMessages)(data.quizCompleted.errors),
                    });
                }
            }
        })();
    }, [recordedAnswer, id, quizCompleted]);
    const close = async () => {
        if (quizVisible) {
            setQuizVisible(false);
            await (0, sleep_1.sleep)(100);
        }
        navigation.goBack();
    };
    const buttonStyleHelper = (i) => {
        return recordedAnswer.indexOf(i) === -1
            ? styles.quizButtonStyle
            : i === 0
                ? styles.quizCorrectButtonStyle
                : styles.quizWrongButtonStyle;
    };
    let j = 0;
    permutation.forEach((i) => {
        answersShuffled.push(<react_native_1.View key={i} style={{ width: "100%" }}>
        <react_native_1.View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
          <base_1.Button title={mappingLetter[j]} buttonStyle={buttonStyleHelper(i)} disabledStyle={buttonStyleHelper(i)} titleStyle={styles.quizButtonTitleStyle} disabledTitleStyle={styles.quizButtonTitleStyle} containerStyle={styles.quizButtonContainerStyle} onPress={() => addRecordedAnswer(i)} disabled={recordedAnswer.indexOf(0) !== -1}/>
          <base_1.Button title={answers[i]} titleStyle={styles.quizTextAnswer} disabledTitleStyle={styles.quizTextAnswer} containerStyle={styles.quizTextContainerStyle} 
        // disabledStyle={styles.quizTextContainerStyle}
        type="clear" onPress={() => addRecordedAnswer(i)} disabled={recordedAnswer.indexOf(0) !== -1}/>
        </react_native_1.View>
        {recordedAnswer.length > 0 &&
                recordedAnswer.indexOf(i) === recordedAnswer.length - 1 ? (<react_native_1.Text style={i === 0 ? styles.correctAnswerText : styles.incorrectAnswerText}>
            {feedback[i]}
          </react_native_1.Text>) : null}
      </react_native_1.View>);
        j = (j + 1);
    });
    return (<screen_1.Screen backgroundColor={colors._lighterGrey} unsafe>
      <react_native_modal_1.default style={{ marginHorizontal: 0, marginBottom: 0, flexGrow: 1 }} isVisible={quizVisible} swipeDirection={quizVisible ? ["down"] : ["up"]} onSwipeComplete={() => setQuizVisible(false)} swipeThreshold={50} propagateSwipe>
        {/* TODO: expand automatically */}
        <react_native_1.View style={{ flexShrink: 1 }}>
          <react_native_gesture_handler_1.TouchableWithoutFeedback onPress={() => setQuizVisible(false)}>
            <react_native_1.View style={{ height: "100%", width: "100%" }}/>
          </react_native_gesture_handler_1.TouchableWithoutFeedback>
        </react_native_1.View>
        <react_native_1.View style={styles.modalBackground}>
          <react_native_1.View style={{ height: 14 }}>
            <Ionicons_1.default name="remove" size={72} color={colors._lightGrey} style={{ height: 40, top: -30 }}/>
          </react_native_1.View>
          <react_native_1.View style={styles.answersView}>
            <react_native_1.Text style={styles.title}>{question !== null && question !== void 0 ? question : title}</react_native_1.Text>
            {answersShuffled}
          </react_native_1.View>
          <react_native_1.View>
            {recordedAnswer.indexOf(0) === -1 ? null : (<base_1.Button title={LL.EarnScreen.keepDigging()} type="outline" onPress={async () => close()} containerStyle={styles.keepDiggingContainerStyle} buttonStyle={styles.buttonStyle} titleStyle={styles.titleStyle}/>)}
          </react_native_1.View>
        </react_native_1.View>
      </react_native_modal_1.default>
      <react_native_safe_area_context_1.SafeAreaView style={{ flex: 1, paddingBottom: 0 }}>
        <react_native_gesture_handler_1.ScrollView persistentScrollbar showsVerticalScrollIndicator bounces>
          <react_native_1.View style={styles.svgContainer}>{(0, earn_svg_factory_1.SVGs)({ name: id, theme: "dark" })}</react_native_1.View>
          <react_native_1.View style={styles.textContainer}>
            <react_native_1.Text style={styles.title}>{title}</react_native_1.Text>
            <react_native_1.Text style={styles.text}>{text}</react_native_1.Text>
          </react_native_1.View>
        </react_native_gesture_handler_1.ScrollView>
      </react_native_safe_area_context_1.SafeAreaView>
      <close_cross_1.CloseCross onPress={async () => close()} color={colors._darkGrey}/>
      <react_native_safe_area_context_1.SafeAreaView style={styles.bottomContainer}>
        <react_native_1.View style={{ paddingVertical: 12 }}>
          {(completed && (<>
              <react_native_1.Text style={styles.textEarn}>
                {LL.EarnScreen.quizComplete({ amount })}
              </react_native_1.Text>
              <base_1.Button title={LL.EarnScreen.reviewQuiz()} type="clear" titleStyle={styles.completedTitleStyle} onPress={() => setQuizVisible(true)}/>
            </>)) || (<base_1.Button title={LL.EarnScreen.earnSats({
                formattedNumber: amount,
            })} buttonStyle={styles.buttonStyle} titleStyle={styles.titleStyle} onPress={() => setQuizVisible(true)}/>)}
        </react_native_1.View>
      </react_native_safe_area_context_1.SafeAreaView>
    </screen_1.Screen>);
};
exports.EarnQuiz = EarnQuiz;
//# sourceMappingURL=earns-quiz.js.map