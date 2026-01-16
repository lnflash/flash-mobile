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
exports.EarnMapScreen = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const mountain_header_1 = require("../../components/mountain-header");
const screen_1 = require("../../components/screen");
const earns_screen_1 = require("../earns-screen");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const sections_1 = require("../earns-screen/sections");
const bitcoin_circle_01_svg_1 = __importDefault(require("./bitcoin-circle-01.svg"));
const bottom_ongoing_01_svg_1 = __importDefault(require("./bottom-ongoing-01.svg"));
const bottom_start_01_svg_1 = __importDefault(require("./bottom-start-01.svg"));
const left_finished_01_svg_1 = __importDefault(require("./left-finished-01.svg"));
const left_last_section_ongoing_01_svg_1 = __importDefault(require("./left-last-section-ongoing-01.svg"));
const left_last_section_to_do_01_svg_1 = __importDefault(require("./left-last-section-to-do-01.svg"));
const left_section_completed_01_svg_1 = __importDefault(require("./left-section-completed-01.svg"));
const left_section_ongoing_01_svg_1 = __importDefault(require("./left-section-ongoing-01.svg"));
const left_section_to_do_01_svg_1 = __importDefault(require("./left-section-to-do-01.svg"));
const right_finished_01_svg_1 = __importDefault(require("./right-finished-01.svg"));
const right_first_section_to_do_01_svg_1 = __importDefault(require("./right-first-section-to-do-01.svg"));
const right_last_section_ongoing_01_svg_1 = __importDefault(require("./right-last-section-ongoing-01.svg"));
const right_last_section_to_do_01_svg_1 = __importDefault(require("./right-last-section-to-do-01.svg"));
const right_section_completed_01_svg_1 = __importDefault(require("./right-section-completed-01.svg"));
const right_section_ongoing_01_svg_1 = __importDefault(require("./right-section-ongoing-01.svg"));
const right_section_to_do_01_svg_1 = __importDefault(require("./right-section-to-do-01.svg"));
const text_block_medium_svg_1 = __importDefault(require("./text-block-medium.svg"));
const use_quiz_server_1 = require("./use-quiz-server");
const themed_1 = require("@rneui/themed");
const BottomOngoingEN = React.lazy(() => import("./bottom-ongoing-01.en.svg"));
const BottomOngoingES = React.lazy(() => import("./bottom-ongoing-01.es.svg"));
const BottomStartEN = React.lazy(() => import("./bottom-start-01.en.svg"));
const BottomStartES = React.lazy(() => import("./bottom-start-01.es.svg"));
const ProgressBar = ({ progress }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    const balanceWidth = `${progress * 100}%`;
    return (<react_native_1.View style={styles.progressContainer}>
      {/* pass props to style object to remove inline style */}
      {/* eslint-disable-next-line react-native/no-inline-styles */}
      <react_native_1.View style={{ width: balanceWidth, height: 3, backgroundColor: colors._white }}/>
    </react_native_1.View>);
};
const EarnMapScreen = () => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const navigation = (0, native_1.useNavigation)();
    const { LL, locale } = (0, i18n_react_1.useI18nContext)();
    const quizQuestionsContent = (0, earns_screen_1.getQuizQuestionsContent)({ LL });
    const sections = Object.keys(sections_1.earnSections);
    const sectionsData = sections.map((section) => ({
        index: section,
        text: LL.EarnScreen.earnSections[section].title(),
        icon: bitcoin_circle_01_svg_1.default,
        onPress: () => navigation.navigate("earnsSection", { section }),
    }));
    const styles = useStyles();
    let currSection = 0;
    let progress = NaN;
    const { loading, quizServerData } = (0, use_quiz_server_1.useQuizServer)({ fetchPolicy: "network-only" });
    for (const section of sections) {
        const sectionCompletion = (0, earns_screen_1.sectionCompletedPct)({
            quizServerData,
            section,
            quizQuestionsContent,
        });
        if (sectionCompletion === 1) {
            currSection += 1;
        }
        else if (isNaN(progress)) {
            // only do it once for the first uncompleted section
            progress = sectionCompletion;
        }
    }
    const earnedSat = quizServerData
        .filter((quiz) => quiz.completed)
        .reduce((acc, { amount }) => acc + amount, 0);
    const Finish = ({ currSection, length }) => {
        if (currSection !== sectionsData.length)
            return null;
        return (<>
        <react_native_1.Text style={styles.finishText}>{LL.EarnScreen.finishText()}</react_native_1.Text>
        {length % 2 ? <left_finished_01_svg_1.default /> : <right_finished_01_svg_1.default />}
      </>);
    };
    const InBetweenTile = ({ side, position, length, }) => {
        if (currSection < position) {
            if (position === length - 1) {
                return side === "left" ? <left_last_section_to_do_01_svg_1.default /> : <right_last_section_to_do_01_svg_1.default />;
            }
            return side === "left" ? <left_section_to_do_01_svg_1.default /> : <right_section_to_do_01_svg_1.default />;
        }
        if (currSection === position) {
            if (position === length - 1) {
                return (<>
            <react_native_1.View style={styles.position}/>
            {side === "left" ? <left_last_section_ongoing_01_svg_1.default /> : <right_last_section_ongoing_01_svg_1.default />}
          </>);
            }
            if (position === 0 && progress === 0) {
                return <right_first_section_to_do_01_svg_1.default />;
            }
            return side === "left" ? <left_section_ongoing_01_svg_1.default /> : <right_section_ongoing_01_svg_1.default />;
        }
        return side === "left" ? <left_section_completed_01_svg_1.default /> : <right_section_completed_01_svg_1.default />;
    };
    const BoxAdding = ({ text, Icon, side, position, length, onPress, }) => {
        const styles = useStyles();
        const disabled = currSection < position;
        const progressSection = disabled ? 0 : currSection > position ? 1 : progress;
        // rework this to pass props into the style object
        const boxStyle = react_native_1.StyleSheet.create({
            container: {
                position: "absolute",
                bottom: currSection === position ? (currSection === 0 && progress === 0 ? 30 : 80) : 30,
                left: side === "left" ? 35 : 200,
                opacity: disabled ? 0.5 : 1,
            },
        });
        return (<react_native_1.View>
        <InBetweenTile side={side} position={position} length={length}/>

        <react_native_1.View style={boxStyle.container}>
          <react_native_1.View>
            <react_native_gesture_handler_1.TouchableOpacity disabled={disabled} onPress={onPress}>
              <text_block_medium_svg_1.default />
              <react_native_1.View style={styles.fullView}>
                <ProgressBar progress={progressSection}/>
                <Icon style={styles.icon} width={50} height={50}/>
                <react_native_1.Text style={styles.textStyleBox}>{text}</react_native_1.Text>
              </react_native_1.View>
            </react_native_gesture_handler_1.TouchableOpacity>
          </react_native_1.View>
        </react_native_1.View>
      </react_native_1.View>);
    };
    const SectionsComp = sectionsData
        .map((item, index) => (<BoxAdding key={item.index} text={item.text} Icon={item.icon} side={index % 2 ? "left" : "right"} position={index} length={sectionsData.length} onPress={item.onPress}/>))
        .reverse();
    const scrollViewRef = React.useRef(null);
    React.useEffect(() => {
        if (scrollViewRef.current) {
            scrollViewRef.current.scrollToEnd();
        }
    }, []);
    if (loading) {
        return (<screen_1.Screen>
        <react_native_1.View style={styles.loadingView}>
          <react_native_1.ActivityIndicator size="large" color={colors._blue}/>
        </react_native_1.View>
      </screen_1.Screen>);
    }
    const backgroundColor = currSection < sectionsData.length ? colors._sky : colors._orange;
    const translatedBottomOngoing = () => {
        switch (locale) {
            case "es":
                return <BottomOngoingES />;
            default:
                return <BottomOngoingEN />;
        }
    };
    const translatedBottomStart = () => {
        switch (locale) {
            case "es":
                return <BottomStartES />;
            default:
                return <BottomStartEN />;
        }
    };
    return (<screen_1.Screen unsafe statusBar="light-content">
      <react_native_gesture_handler_1.ScrollView 
    // removeClippedSubviews={true}
    style={{ backgroundColor }} contentContainerStyle={styles.contentContainer} ref={scrollViewRef} onContentSizeChange={() => {
            if (scrollViewRef.current) {
                scrollViewRef.current.scrollToEnd();
            }
        }}>
        <mountain_header_1.MountainHeader amount={earnedSat.toString()} color={backgroundColor}/>
        <react_native_1.View style={styles.mainView}>
          <Finish currSection={currSection} length={sectionsData.length}/>
          {SectionsComp}
          {currSection === 0 ? (progress === 0 ? (<React.Suspense fallback={<bottom_start_01_svg_1.default />}>
                {translatedBottomStart()}
              </React.Suspense>) : (<React.Suspense fallback={<bottom_ongoing_01_svg_1.default />}>
                {translatedBottomOngoing()}
              </React.Suspense>)) : (<react_native_1.View style={styles.position}/>)}
        </react_native_1.View>
      </react_native_gesture_handler_1.ScrollView>
    </screen_1.Screen>);
};
exports.EarnMapScreen = EarnMapScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    contentContainer: {
        backgroundColor: colors._gold,
        flexGrow: 1,
    },
    finishText: {
        color: colors._white,
        fontSize: 18,
        position: "absolute",
        right: 30,
        textAlign: "center",
        top: 30,
        width: 160,
    },
    icon: {
        marginBottom: 6,
        marginHorizontal: 10,
    },
    mainView: {
        alignSelf: "center",
    },
    textStyleBox: {
        color: colors._white,
        fontSize: 16,
        fontWeight: "bold",
        marginHorizontal: 10,
    },
    progressContainer: { backgroundColor: colors._darkGrey, margin: 10 },
    position: { height: 40 },
    loadingView: { flex: 1, justifyContent: "center", alignItems: "center" },
    fullView: { position: "absolute", width: "100%" },
}));
//# sourceMappingURL=earns-map-screen.js.map