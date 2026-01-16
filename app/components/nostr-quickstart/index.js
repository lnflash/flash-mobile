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
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_reanimated_carousel_1 = __importDefault(require("react-native-reanimated-carousel"));
const themed_1 = require("@rneui/themed");
// assets (replace with your actual Nostr illustrations/icons)
const social_chat_svg_1 = __importDefault(require("@app/assets/illustrations/social-chat.svg"));
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const persistent_state_1 = require("@app/store/persistent-state");
const width = react_native_1.Dimensions.get("window").width;
const NostrQuickStart = () => {
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const ref = (0, react_1.useRef)(null);
    let nostrCarouselData = [
        {
            type: "writeYourFirstMessage",
            title: LL.NostrQuickStart.postHeading(),
            description: LL.NostrQuickStart.postDesc(),
            image: social_chat_svg_1.default,
            onPress: () => navigation.navigate("makeNostrPost"),
        },
    ];
    // filter out closed cards
    nostrCarouselData = nostrCarouselData.filter((el) => { var _a; return !((_a = persistentState === null || persistentState === void 0 ? void 0 : persistentState.closedQuickStartTypes) === null || _a === void 0 ? void 0 : _a.includes(el.type)); });
    const onHide = (type) => {
        updateState((state) => {
            if (state) {
                return Object.assign(Object.assign({}, state), { closedQuickStartTypes: state.closedQuickStartTypes
                        ? [...state.closedQuickStartTypes, type]
                        : [type] });
            }
            return undefined;
        });
    };
    const renderItem = ({ item, index }) => {
        const Image = item.image;
        return (<react_native_1.TouchableOpacity onPress={item.onPress} key={index} style={styles.itemContainer}>
        <Image height={width / 3} width={width / 3}/>
        <react_native_1.View style={styles.texts}>
          <themed_1.Text type="h1" bold style={styles.title}>
            {item.title}
          </themed_1.Text>
          <themed_1.Text type="bl">{item.description}</themed_1.Text>
        </react_native_1.View>
        <react_native_1.TouchableOpacity style={styles.close} onPress={() => onHide(item.type)}>
          <themed_1.Icon name={"close"} type="ionicon" color={colors.black} size={30}/>
        </react_native_1.TouchableOpacity>
      </react_native_1.TouchableOpacity>);
    };
    if (nostrCarouselData.length > 0) {
        return (<react_native_1.View>
        <react_native_reanimated_carousel_1.default ref={ref} width={width} height={width / 2.5} data={nostrCarouselData} renderItem={renderItem} mode="parallax" loop={nostrCarouselData.length !== 1} containerStyle={{ marginTop: 10 }}/>
      </react_native_1.View>);
    }
    else {
        return <react_native_1.View style={{ height: 20 }}/>;
    }
};
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    itemContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderRadius: 20,
        borderColor: colors.black,
        padding: 10,
    },
    texts: {
        flex: 1,
    },
    title: {
        marginBottom: 2,
        width: "85%",
    },
    close: {
        position: "absolute",
        top: 0,
        right: 0,
        padding: 5,
    },
}));
exports.default = NostrQuickStart;
//# sourceMappingURL=index.js.map