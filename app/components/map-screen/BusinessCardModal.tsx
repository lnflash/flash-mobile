import React, { memo } from "react"
import {
  View,
  TouchableOpacity,
  Linking,
  Modal,
  StyleSheet as RNStyleSheet,
} from "react-native"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import Icon from "react-native-vector-icons/Ionicons"

const COLORS = {
  orange: "#F39C12",
  darkText: "#2C3E50",
  mutedText: "#7F8C8D",
  blue: "#3498DB",
  red: "#E74C3C",
  green: "#27AE60",
  buttonBorder: "#DEE2E6",
  buttonText: "#495057",
  overlay: "rgba(0,0,0,0.5)",
}

type MarkerItem = {
  username: string
  source: "blink" | "flash"
  mapInfo: {
    title: string
    coordinates: {
      latitude: number
      longitude: number
    }
  }
  acceptsFlash?: boolean
  redeemTopup?: boolean
  hasRewards?: boolean
}

type Props = {
  visible: boolean
  item: MarkerItem | null
  chatEnabled: boolean
  onClose: () => void
  onPayBusiness: () => void
  onGetDirections: () => void
  onChat: () => void
}

const SERVICE_BADGES = [
  { key: "acceptsFlash", icon: "card-outline", label: "Flash Pay", color: COLORS.orange },
  { key: "redeemTopup", icon: "cash-outline", label: "Cash", color: COLORS.blue },
  { key: "hasRewards", icon: "gift-outline", label: "Rewards", color: COLORS.red },
] as const

export const BusinessCardModal: React.FC<Props> = memo(
  ({ visible, item, chatEnabled, onClose, onPayBusiness, onGetDirections, onChat }) => {
    const styles = useStyles()

    if (!item) return null

    const firstLetter = item.mapInfo.title.charAt(0).toUpperCase()

    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <TouchableOpacity
          style={modalStyles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        >
          <View />
        </TouchableOpacity>
        <View style={modalStyles.bottomContainer}>
          <View style={styles.card}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Icon name="close" size={24} color={COLORS.buttonText} />
            </TouchableOpacity>

            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <View style={styles.logoCircle}>
                  <Text style={styles.logoLetter}>{firstLetter}</Text>
                </View>
                <View style={styles.verifiedBadge}>
                  <Icon name="checkmark-circle" size={18} color={COLORS.green} />
                </View>
              </View>
              <Text style={styles.businessName}>{item.mapInfo.title}</Text>
              <Text style={styles.username}>@{item.username}</Text>
            </View>

            <View style={styles.servicesSection}>
              <Text style={styles.servicesLabel}>Available Services</Text>
              <View style={styles.badgesContainer}>
                {SERVICE_BADGES.map((badge) => {
                  const isActive = (item as Record<string, unknown>)[badge.key] !== false
                  return (
                    <View key={badge.key} style={styles.badgeItem}>
                      <Icon
                        name={badge.icon}
                        size={18}
                        color={isActive ? badge.color : COLORS.mutedText}
                      />
                      <Text
                        style={[
                          styles.badgeText,
                          { color: isActive ? badge.color : COLORS.mutedText },
                        ]}
                      >
                        {badge.label}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </View>

            <View style={styles.actionsSection}>
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    const { latitude, longitude } = item.mapInfo.coordinates
                    Linking.openURL(
                      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
                    )
                    onClose()
                  }}
                >
                  <Icon name="navigate-outline" size={14} color={COLORS.buttonText} />
                  <Text style={styles.secondaryButtonText}>Directions</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryButton, !chatEnabled && styles.disabledButton]}
                  onPress={chatEnabled ? onChat : undefined}
                  disabled={!chatEnabled}
                >
                  <Icon
                    name="chatbubble-outline"
                    size={14}
                    color={chatEnabled ? COLORS.buttonText : COLORS.mutedText}
                  />
                  <Text
                    style={[
                      styles.secondaryButtonText,
                      !chatEnabled && { color: COLORS.mutedText },
                    ]}
                  >
                    Chat
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={onPayBusiness}>
                <Icon name="flash-outline" size={14} color="white" />
                <Text style={styles.primaryButtonText}>Pay Flashpoint</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    )
  },
)
BusinessCardModal.displayName = "BusinessCardModal"

const modalStyles = RNStyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
  },
  bottomContainer: {
    justifyContent: "flex-end",
  },
})

const useStyles = makeStyles(({ colors }) => ({
  card: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 10,
    padding: 4,
  },
  header: {
    padding: 16,
    alignItems: "center",
  },
  logoContainer: {
    marginBottom: 12,
    position: "relative",
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.orange,
    justifyContent: "center",
    alignItems: "center",
  },
  logoLetter: {
    fontSize: 22,
    fontWeight: "700",
    color: "white",
  },
  verifiedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: "white",
    borderRadius: 10,
  },
  businessName: {
    fontSize: 19,
    fontWeight: "700",
    color: COLORS.darkText,
    textAlign: "center",
    marginBottom: 3,
  },
  username: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.orange,
    marginBottom: 4,
  },
  servicesSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  servicesLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.mutedText,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  badgesContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
  },
  badgeItem: {
    alignItems: "center",
    gap: 2,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "600",
  },
  actionsSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.buttonBorder,
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.buttonText,
  },
  disabledButton: {
    opacity: 0.4,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: COLORS.orange,
    gap: 6,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "white",
  },
}))
