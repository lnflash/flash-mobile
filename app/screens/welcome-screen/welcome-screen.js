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
exports.WelcomeFirstScreen = void 0;
/* eslint-disable react-native/no-color-literals */
/* eslint-disable react-native/no-unused-styles */
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_reanimated_carousel_1 = __importDefault(require("react-native-reanimated-carousel"));
const screen_1 = require("../../components/screen");
const themed_1 = require("@rneui/themed");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const { width, height } = react_native_1.Dimensions.get("window");
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    flex: {
        flex: 1,
    },
    cover: {
        top: height < 560 ? "-25%" : 0,
        left: height < 560 ? "-7.5%" : 0,
        width: height < 560 ? "115%" : "100%",
        height: height < 560 ? "115%" : "100%",
        resizeMode: height < 560 ? "contain" : "cover",
    },
    button: {
        backgroundColor: colors.primary,
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 5,
    },
    container: {
        flex: 1,
    },
    buttonContainer: {
        position: "absolute",
        bottom: 50,
        width: "100%",
        alignItems: "center",
    },
    touchableArea: {
        position: "absolute",
        bottom: 0,
        width: "100%",
        height: "12%",
    },
    touchableAreaSkip: {
        position: "absolute",
        top: 0,
        right: 0,
        width: "25%",
        height: "10%",
    },
}));
const WelcomeFirstScreen = ({ navigation }) => {
    const styles = useStyles();
    const [currentIndex, setCurrentIndex] = React.useState(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const carouselRef = React.useRef(null);
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    console.log("currentIndex: ", currentIndex);
    const handlePress = (index) => {
        if (index < 2) {
            setCurrentIndex(index + 1);
        }
        else if (isAuthed) {
            navigation.navigate("Primary");
        }
        else {
            navigation.navigate("getStarted");
        }
    };
    React.useEffect(() => {
        var _a;
        // Scroll to the updated index when currentIndex changes
        (_a = carouselRef.current) === null || _a === void 0 ? void 0 : _a.scrollTo({ index: currentIndex, animated: true });
    }, [currentIndex]);
    const renderItem = ({ index }) => (<screen_1.Screen statusBar="light-content">
      <react_native_1.View style={styles.container}>
        <themed_1.Image source={index === 0
            ? require("@app/assets/images/welcome-1.png")
            : index === 1
                ? require("@app/assets/images/welcome-2.png")
                : require("@app/assets/images/welcome-3.png")} style={styles.cover}/>
        <react_native_1.TouchableOpacity style={styles.touchableAreaSkip} onPress={() => handlePress(2)}/>
        <react_native_1.TouchableOpacity style={styles.touchableArea} onPress={() => handlePress(index)}/>
      </react_native_1.View>
    </screen_1.Screen>);
    return (<react_native_reanimated_carousel_1.default ref={carouselRef} width={width} height={height} data={[0, 1, 2]} renderItem={renderItem} onSnapToItem={(index) => setCurrentIndex(index)} pagingEnabled autoPlay={false} loop={false}/>);
};
exports.WelcomeFirstScreen = WelcomeFirstScreen;
//# sourceMappingURL=welcome-screen.js.map