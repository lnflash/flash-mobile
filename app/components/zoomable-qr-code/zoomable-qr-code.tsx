import * as React from "react"
import { useState, useRef, useEffect } from "react"
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  StyleProp,
  ViewStyle,
  Modal,
  useWindowDimensions,
  TouchableOpacity,
  Text,
  Platform,
  PanResponder,
} from "react-native"
import QRCode from "react-native-qrcode-svg"
import { PinchGestureHandler, State, GestureHandlerRootView } from "react-native-gesture-handler"
import { makeStyles, useTheme } from "@rneui/themed"
import { GaloyIcon } from "@app/components/atomic/galoy-icon"

type Props = {
  value: string
  size?: number
  logo?: any
  logoSize?: number
  logoBorderRadius?: number
  logoBackgroundColor?: string
  ecl?: "L" | "M" | "Q" | "H"
  style?: StyleProp<ViewStyle>
}

export const ZoomableQRCode: React.FC<Props> = ({
  value,
  size = 200,
  logo,
  logoSize = 60,
  logoBorderRadius = 10,
  logoBackgroundColor = "white",
  ecl = "L",
  style,
}) => {
  const { width, height } = useWindowDimensions()
  const [modalVisible, setModalVisible] = useState(false)
  const scale = useRef(new Animated.Value(1)).current
  const [currentScale, setCurrentScale] = useState(1)
  const {theme: { colors }} = useTheme()
  const styles = useStyles()
  const isAndroid = Platform.OS === 'android'

  // Handle pinch events via Animated.event
  const onPinchGestureEvent = Animated.event(
    [{ nativeEvent: { scale } }],
    { 
      useNativeDriver: true,
      listener: (event: any) => {
        // Update current scale as the user pinches
        setCurrentScale(event.nativeEvent.scale)
      }
    }
  )

  // For when pinch gesture ends
  const onPinchHandlerStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      // Keep the current scale (don't animate back to 1)
      const finalScale = Math.max(0.5, Math.min(event.nativeEvent.scale, 4.0))
      setCurrentScale(finalScale)
      scale.setValue(finalScale)
    }
  }

  // Alternative implementation for devices that struggle with gesture handler
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (evt.nativeEvent.touches.length === 2) {
          // Calculate distance between fingers
          const dx = Math.abs(evt.nativeEvent.touches[0].pageX - evt.nativeEvent.touches[1].pageX)
          const dy = Math.abs(evt.nativeEvent.touches[0].pageY - evt.nativeEvent.touches[1].pageY)
          const distance = Math.sqrt(dx * dx + dy * dy)
          
          // Update scale based on distance change
          const newScale = Math.max(0.5, Math.min(distance / 150, 4.0))
          scale.setValue(newScale)
          setCurrentScale(newScale)
        }
      },
      onPanResponderRelease: () => {
        // Keep the current scale
      },
    })
  ).current

  const openModal = () => {
    setModalVisible(true)
    // Reset scale when modal opens
    scale.setValue(1)
    setCurrentScale(1)
  }

  const closeModal = () => {
    setModalVisible(false)
  }

  const modalQRSize = Math.min(width, height) * 0.8
  const zoomControls = () => (
    <View style={styles.zoomControls}>
      <TouchableOpacity 
        style={styles.zoomButton}
        onPress={() => {
          const newScale = Math.max(0.5, currentScale - 0.5)
          scale.setValue(newScale)
          setCurrentScale(newScale)
        }}
      >
        <Text style={styles.zoomButtonText}>-</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={styles.zoomButton}
        onPress={() => {
          const newScale = Math.min(4.0, currentScale + 0.5)
          scale.setValue(newScale)
          setCurrentScale(newScale)
        }}
      >
        <Text style={styles.zoomButtonText}>+</Text>
      </TouchableOpacity>
    </View>
  )

  // Render QR code with appropriate wrapper based on platform
  const renderZoomableQRCode = () => {
    const qrCode = (
      <Animated.View style={[{ transform: [{ scale }] }, styles.qrContainer]}>
        <QRCode
          value={value}
          size={modalQRSize}
          logo={logo}
          logoSize={logoSize * (modalQRSize / size)}
          logoBorderRadius={logoBorderRadius * (modalQRSize / size)}
          logoBackgroundColor={logoBackgroundColor}
          ecl={ecl}
        />
        <Text style={styles.pinchHintText}>
          {isAndroid ? "Use +/- buttons to zoom" : "Pinch to zoom"}
        </Text>
      </Animated.View>
    )

    // For Android, use PanResponder
    if (isAndroid) {
      return (
        <View {...panResponder.panHandlers}>
          {qrCode}
          {zoomControls()}
        </View>
      )
    }

    // For iOS, use PinchGestureHandler
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PinchGestureHandler
          onGestureEvent={onPinchGestureEvent}
          onHandlerStateChange={onPinchHandlerStateChange}
        >
          {qrCode}
        </PinchGestureHandler>
      </GestureHandlerRootView>
    )
  }

  return (
    <>
      <TouchableOpacity onPress={openModal} style={[styles.container, style]} activeOpacity={0.8}>
        <View>
          <QRCode
            value={value}
            size={size}
            logo={logo}
            logoSize={logoSize}
            logoBorderRadius={logoBorderRadius}
            logoBackgroundColor={logoBackgroundColor}
            ecl={ecl}
          />
          <View style={styles.zoomHintContainer}>
            <Text style={styles.zoomHintText}>Tap to expand</Text>
          </View>
        </View>
      </TouchableOpacity>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Pressable style={styles.closeButton} onPress={closeModal}>
              <GaloyIcon name="close" size={24} color={colors.black} />
            </Pressable>
            
            {renderZoomableQRCode()}
          </View>
        </View>
      </Modal>
    </>
  )
}

const useStyles = makeStyles(({colors}) => ({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  zoomHintContainer: {
    position: 'absolute',
    bottom: 5,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  zoomHintText: {
    color: 'white',
    fontSize: 10,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: '90%',
    maxWidth: 400,
  },
  closeButton: {
    position: 'absolute',
    right: 10,
    top: 10,
    padding: 5,
    zIndex: 1,
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    flex: 1,
  },
  pinchHintText: {
    marginTop: 10,
    color: colors.grey3,
    fontSize: 14,
  },
  zoomControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.grey5,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  zoomButtonText: {
    fontSize: 24,
    color: colors.black,
    fontWeight: 'bold',
  },
}))
