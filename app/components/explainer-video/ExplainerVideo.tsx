import React, { useState, useRef } from "react"
import { View, TouchableOpacity, StyleSheet, ViewStyle, Text } from "react-native"
import Video from "react-native-video"
import Icon from "react-native-vector-icons/Ionicons"
import { useTheme } from "@rneui/themed"

interface ExplainerVideoProps {
  videoUrl: string
  style?: ViewStyle
  title?: string
}

export const ExplainerVideo: React.FC<ExplainerVideoProps> = ({
  videoUrl,
  style,
  title = "Learn About Nostr",
}) => {
  const { theme } = useTheme()
  const [paused, setPaused] = useState(true)
  const [muted, setMuted] = useState(true)
  const [hasEnded, setHasEnded] = useState(false)
  const videoRef = useRef<Video>(null)

  const togglePlayPause = () => {
    if (hasEnded && videoRef.current) {
      // If video has ended, seek back to beginning
      videoRef.current.seek(0)
      setHasEnded(false)
    }
    setPaused(!paused)
  }

  const toggleMute = () => {
    setMuted(!muted)
  }

  return (
    <View style={style}>
      {/* Title label */}
      <Text style={[styles.title, { color: theme.colors.grey1 }]}>{title}</Text>

      <View style={styles.container}>
        <Video
          ref={videoRef}
          source={{ uri: videoUrl }}
          style={styles.video}
          paused={paused}
          muted={muted}
          repeat={false}
          resizeMode="cover"
          controls={false}
          onEnd={() => {
            setPaused(true)
            setHasEnded(true)
          }}
        />

        {/* Play/Pause overlay */}
        <TouchableOpacity
          style={styles.overlay}
          onPress={togglePlayPause}
          activeOpacity={0.9}
        >
          {paused && (
            <View style={styles.playButton}>
              <Icon name="play" size={48} color="#FFFFFF" />
            </View>
          )}
        </TouchableOpacity>

        {/* Mute/Unmute button */}
        <TouchableOpacity
          style={styles.muteButton}
          onPress={toggleMute}
          activeOpacity={0.8}
        >
          <View
            style={[styles.muteButtonInner, { backgroundColor: "rgba(0, 0, 0, 0.6)" }]}
          >
            <Icon
              name={muted ? "volume-mute" : "volume-high"}
              size={20}
              color="#FFFFFF"
            />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
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
})
