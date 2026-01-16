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
exports.ExplainerVideo = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_video_1 = __importDefault(require("react-native-video"));
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const themed_1 = require("@rneui/themed");
const ExplainerVideo = ({ videoUrl, style, title = "Learn About Nostr", }) => {
    const { theme } = (0, themed_1.useTheme)();
    const [paused, setPaused] = (0, react_1.useState)(true);
    const [muted, setMuted] = (0, react_1.useState)(true);
    const [hasEnded, setHasEnded] = (0, react_1.useState)(false);
    const videoRef = (0, react_1.useRef)(null);
    const togglePlayPause = () => {
        if (hasEnded && videoRef.current) {
            // If video has ended, seek back to beginning
            videoRef.current.seek(0);
            setHasEnded(false);
        }
        setPaused(!paused);
    };
    const toggleMute = () => {
        setMuted(!muted);
    };
    return (<react_native_1.View style={style}>
      {/* Title label */}
      <react_native_1.Text style={[styles.title, { color: theme.colors.grey1 }]}>{title}</react_native_1.Text>

      <react_native_1.View style={styles.container}>
        <react_native_video_1.default ref={videoRef} source={{ uri: videoUrl }} style={styles.video} paused={paused} muted={muted} repeat={false} resizeMode="cover" controls={false} onEnd={() => {
            setPaused(true);
            setHasEnded(true);
        }}/>

        {/* Play/Pause overlay */}
        <react_native_1.TouchableOpacity style={styles.overlay} onPress={togglePlayPause} activeOpacity={0.9}>
          {paused && (<react_native_1.View style={styles.playButton}>
              <Ionicons_1.default name="play" size={48} color="#FFFFFF"/>
            </react_native_1.View>)}
        </react_native_1.TouchableOpacity>

        {/* Mute/Unmute button */}
        <react_native_1.TouchableOpacity style={styles.muteButton} onPress={toggleMute} activeOpacity={0.8}>
          <react_native_1.View style={[styles.muteButtonInner, { backgroundColor: "rgba(0, 0, 0, 0.6)" }]}>
            <Ionicons_1.default name={muted ? "volume-mute" : "volume-high"} size={20} color="#FFFFFF"/>
          </react_native_1.View>
        </react_native_1.TouchableOpacity>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.ExplainerVideo = ExplainerVideo;
const styles = react_native_1.StyleSheet.create({
    title: {
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 8,
    },
    container: {
        width: "100%",
        aspectRatio: 16 / 9,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#000",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    video: {
        width: "100%",
        height: "100%",
    },
    overlay: Object.assign(Object.assign({}, react_native_1.StyleSheet.absoluteFillObject), { justifyContent: "center", alignItems: "center" }),
    playButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 3,
        borderColor: "#FFFFFF",
    },
    muteButton: {
        position: "absolute",
        bottom: 12,
        right: 12,
    },
    muteButtonInner: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: "center",
        alignItems: "center",
    },
});
//# sourceMappingURL=ExplainerVideo.js.map