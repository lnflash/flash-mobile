import React, { useEffect, useState } from "react"
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { Screen } from "@app/components/screen"
import { GaloyIcon } from "@app/components/atomic/galoy-icon"
import { CashuService } from "@app/services/ecash/cashu-service"
import { MintInfo } from "@app/services/ecash/mint-management"
import { makeStyles, useTheme } from "@rneui/themed"
import { isValidHttpUrl } from "../../utils/validation"
import Cashu from "@app/assets/icons/cashu.svg"

type Props = StackScreenProps<RootStackParamList, "ManageMints">

/**
 * Component for a toggleable form to add a new Cashu mint
 */
const AddMintForm = ({
  onAdd,
  isOpen,
  toggleOpen,
}: {
  onAdd: (url: string, name?: string) => Promise<void>
  isOpen: boolean
  toggleOpen: () => void
}) => {
  const [url, setUrl] = useState("")
  const [name, setName] = useState("")
  const [isValid, setIsValid] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const styles = useStyles()
  const { colors } = useTheme().theme

  // Validate URL when it changes
  useEffect(() => {
    setIsValid(isValidHttpUrl(url))
  }, [url])

  // Reset form when closed
  useEffect(() => {
    if (!isOpen) {
      setUrl("")
      setName("")
    }
  }, [isOpen])

  const handleAdd = async () => {
    if (!isValid) return

    setIsAdding(true)
    try {
      await onAdd(url, name)
      toggleOpen() // Close form after successful add
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to add mint")
    } finally {
      setIsAdding(false)
    }
  }

  if (!isOpen) {
    return (
      <TouchableOpacity style={styles.addButton} onPress={toggleOpen} activeOpacity={0.7}>
        <GaloyIcon name="plus" size={24} color={colors.white} />
        <Text style={styles.addButtonText}>Add New Mint</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.cardContainer}>
      <Text style={styles.formTitle}>Add New Mint</Text>

      <Text style={styles.label}>Mint URL</Text>
      <TextInput
        style={[styles.input, !url || isValid ? {} : styles.invalidInput]}
        value={url}
        onChangeText={setUrl}
        placeholder="https://mint.example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      {url && !isValid && <Text style={styles.errorText}>Please enter a valid URL</Text>}

      <Text style={styles.label}>Name (Optional)</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="My Custom Mint"
      />

      <View style={styles.formButtons}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={toggleOpen}
          disabled={isAdding}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.addMintButton, !isValid && styles.disabledButton]}
          onPress={handleAdd}
          disabled={!isValid || isAdding}
        >
          {isAdding ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text style={styles.addMintButtonText}>Add Mint</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

/**
 * Component to display a single mint with controls
 */
const MintItem = ({
  mint,
  onToggleActive,
  onSetDefault,
  onRemove,
  balance,
}: {
  mint: MintInfo
  onToggleActive: (url: string, isActive: boolean) => Promise<void>
  onSetDefault: (url: string) => Promise<void>
  onRemove: (url: string) => Promise<void>
  balance: number
}) => {
  const [isSettingDefault, setIsSettingDefault] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const styles = useStyles()
  const { colors } = useTheme().theme

  const handleToggleActive = async () => {
    setIsToggling(true)
    try {
      await onToggleActive(mint.url, !mint.isActive)
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to update mint",
      )
    } finally {
      setIsToggling(false)
    }
  }

  const handleSetDefault = async () => {
    if (mint.isDefault) return

    setIsSettingDefault(true)
    try {
      await onSetDefault(mint.url)
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to set default mint",
      )
    } finally {
      setIsSettingDefault(false)
    }
  }

  const handleRemove = async () => {
    Alert.alert(
      "Remove Mint",
      `Are you sure you want to remove "${mint.name || mint.url}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setIsRemoving(true)
            try {
              await onRemove(mint.url)
            } catch (error) {
              Alert.alert(
                "Error",
                error instanceof Error ? error.message : "Failed to remove mint",
              )
            } finally {
              setIsRemoving(false)
            }
          },
        },
      ],
    )
  }

  return (
    <View style={styles.mintItemCard}>
      {/* Left section with icon and name */}
      <View style={styles.mintItemLeftSection}>
        <View style={styles.mintIconContainer}>
          <Cashu width={24} height={24} />
        </View>

        <View style={styles.mintInfoSection}>
          <Text style={styles.mintName} numberOfLines={1}>
            {mint.name || mint.url}
          </Text>

          {mint.isDefault ? (
            <View style={styles.defaultIndicator}>
              <GaloyIcon name="check-circle" size={12} color={colors.success} />
              <Text style={styles.defaultIndicatorText}>Default</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.setDefaultButton}
              onPress={handleSetDefault}
              disabled={isSettingDefault}
            >
              {isSettingDefault ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={styles.smallLoader}
                />
              ) : (
                <>
                  <GaloyIcon name="plus" size={10} color={colors.grey1} />
                  <Text style={styles.setDefaultButtonText}>Set Default</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Right section with balance and controls */}
      <View style={styles.mintItemRightSection}>
        <View style={styles.mintBalanceContainer}>
          <Text style={styles.mintBalanceValue}>{balance}</Text>
          <Text style={styles.mintBalanceUnit}>sats</Text>
        </View>

        {isToggling ? (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={styles.toggleLoader}
          />
        ) : (
          <Switch
            value={mint.isActive}
            onValueChange={handleToggleActive}
            trackColor={{ false: colors.grey4, true: colors.success }}
          />
        )}

        {!mint.isDefault && (
          <TouchableOpacity
            style={styles.mintRemoveButton}
            onPress={handleRemove}
            disabled={isRemoving}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            {isRemoving ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <GaloyIcon name="close" size={16} color={colors.error} />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

// Update with verified working mints
const RECOMMENDED_MINTS = [
  {
    name: "Flash App Mint",
    url: "https://forge.flashapp.me",
    description: "Official Flash App hosted mint",
  },
  {
    name: "8333 Space",
    url: "https://8333.space:3338",
    description: "Community-operated Cashu mint",
  },
  {
    name: "MiniBits Bitcoin",
    url: "https://mint.minibits.cash/Bitcoin",
    description: "Mint by MiniBits wallet",
  },
  {
    name: "LN Voltz",
    url: "https://mint.lnvoltz.com",
    description: "LN Voltz Cashu mint",
  },
  {
    name: "LN Wallet",
    url: "https://mint.lnwallet.app",
    description: "Mint by LN Wallet",
  },
  {
    name: "LN Server",
    url: "https://mint.lnserver.com",
    description: "LN Server Cashu mint",
  },
  {
    name: "0xChat",
    url: "https://mint.0xchat.com",
    description: "0xChat Cashu mint service",
  },
  {
    name: "21Mint",
    url: "https://21mint.me",
    description: "21 Mint service",
  },
  {
    name: "LN Fast",
    url: "https://mint.lnfast.com",
    description: "Fast Lightning-powered mint",
  },
  {
    name: "Western BTC",
    url: "https://mint.westernbtc.com",
    description: "Western BTC ecosystem mint",
  },
  {
    name: "Nutmix 2",
    url: "https://mint2.nutmix.cash",
    description: "Nutmix alternative mint",
  },
  {
    name: "Belgian Bitcoin Embassy",
    url: "https://mint.belgianbitcoinembassy.org",
    description: "Belgian Bitcoin Embassy mint",
  },
]

// Add a DiscoverMint component before the ManageMintsScreen
/**
 * Component to display a recommended mint with easy add functionality
 */
const DiscoverMint = ({
  name,
  url,
  description,
  onAdd,
  existingMints,
}: {
  name: string
  url: string
  description: string
  onAdd: (url: string, name: string) => Promise<void>
  existingMints: MintInfo[]
}) => {
  const [isAdding, setIsAdding] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const styles = useStyles()
  const { colors } = useTheme().theme

  // Check if this mint is already added
  const isAlreadyAdded = existingMints.some((mint) => mint.url === url)

  const handleAddMint = async () => {
    if (isAlreadyAdded) return

    setIsTesting(true)

    try {
      const cashuService = CashuService.getInstance()
      const connectionSuccess = await cashuService.testMintConnection(url)

      if (!connectionSuccess) {
        Alert.alert(
          "Connection Failed",
          `Could not connect to ${name}. Please try again later.`,
        )
        setIsTesting(false)
        return
      }

      setIsTesting(false)
      setIsAdding(true)
      await onAdd(url, name)
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to add mint")
      setIsTesting(false)
      setIsAdding(false)
    }
  }

  return (
    <TouchableOpacity
      style={styles.discoverMintCard}
      onPress={handleAddMint}
      disabled={isAdding || isAlreadyAdded || isTesting}
      activeOpacity={0.8}
    >
      <View style={styles.discoverMintContent}>
        <Text style={styles.discoverMintName}>{name}</Text>
        <Text style={styles.discoverMintUrl}>{url}</Text>
        <Text style={styles.discoverMintDescription}>{description}</Text>
      </View>
      <View style={styles.discoverMintAction}>
        {isTesting ? (
          <View style={styles.testingBadge}>
            <ActivityIndicator size="small" color={colors.white} />
            <Text style={styles.testingText}>Testing...</Text>
          </View>
        ) : isAdding ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : isAlreadyAdded ? (
          <View style={styles.alreadyAddedBadge}>
            <GaloyIcon name="check" size={14} color={colors.white} />
            <Text style={styles.alreadyAddedText}>Added</Text>
          </View>
        ) : (
          <View style={styles.addMintBadge}>
            <GaloyIcon name="plus" size={14} color={colors.white} />
            <Text style={styles.addMintBadgeText}>Add</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

// Modify the DiscoverMintsSection to filter out already added mints
const DiscoverMintsSection = ({
  onAddMint,
  existingMints,
}: {
  onAddMint: (url: string, name: string) => Promise<void>
  existingMints: MintInfo[]
}) => {
  const styles = useStyles()

  // Get mints that aren't already added
  const availableMints = RECOMMENDED_MINTS.filter(
    (recommendedMint) => !existingMints.some((mint) => mint.url === recommendedMint.url),
  )

  // If all recommended mints are already added, show a message
  if (availableMints.length === 0) {
    return (
      <View style={styles.discoverSection}>
        <Text style={styles.discoverSectionTitle}>Discover Mints</Text>
        <View style={styles.allAddedContainer}>
          <Text style={styles.allAddedText}>All recommended mints have been added.</Text>
        </View>
      </View>
    )
  }

  // Select up to 3 random mints from the available ones
  const getRandomMints = (mints: typeof RECOMMENDED_MINTS, count: number) => {
    // Make a copy of the array to avoid modifying the original
    const mintsCopy = [...mints]

    // Shuffle the array using Fisher-Yates algorithm (modified to avoid -- operator)
    for (let i = mintsCopy.length - 1; i >= 1; i = i - 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[mintsCopy[i], mintsCopy[j]] = [mintsCopy[j], mintsCopy[i]]
    }

    // Return the first 'count' elements or all if less than count
    return mintsCopy.slice(0, Math.min(count, mintsCopy.length))
  }

  // Get up to 3 random mints
  const randomMints = getRandomMints(availableMints, 3)

  return (
    <View style={styles.discoverSection}>
      <Text style={styles.discoverSectionTitle}>Discover Mints</Text>
      <Text style={styles.discoverSectionSubtitle}>
        Popular mints you can add with a single tap
      </Text>

      {randomMints.map((mint) => (
        <DiscoverMint
          key={mint.url}
          name={mint.name}
          url={mint.url}
          description={mint.description}
          onAdd={onAddMint}
          existingMints={existingMints}
        />
      ))}
    </View>
  )
}

/**
 * Screen for managing Cashu mints
 */
export const ManageMintsScreen: React.FC<Props> = ({ navigation: _navigation }) => {
  const [mints, setMints] = useState<MintInfo[]>([])
  const [mintBalances, setMintBalances] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // Add a state variable for collapsible section
  const [mintsCollapsed, setMintsCollapsed] = useState(false)
  // Add a random seed to force re-render of the Discover section
  const [randomSeed, setRandomSeed] = useState(Date.now())
  const styles = useStyles()
  const { colors } = useTheme().theme

  // Load mints when screen mounts
  useEffect(() => {
    loadMints()
  }, [])

  const loadMints = async () => {
    setLoading(true)
    try {
      const cashuService = CashuService.getInstance()

      // Get all mints
      const allMints = await cashuService.getAllMints()
      setMints(allMints)

      // Get balances for each mint
      const balances = await cashuService.getMintBalances()
      setMintBalances(balances)
    } catch (error) {
      console.error("Failed to load mints:", error)
      Alert.alert("Error", "Failed to load mints")
    } finally {
      // Generate a new random seed for the discover section
      setRandomSeed(Date.now())
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleAddMint = async (url: string, name?: string) => {
    try {
      const cashuService = CashuService.getInstance()

      // First try to connect to the mint to validate it works
      const success = await cashuService.testMintConnection(url)

      if (!success) {
        Alert.alert(
          "Connection Failed",
          "Could not connect to the mint. Please check the URL and try again.",
        )
        return
      }

      // Only add the mint if the connection test passed
      await cashuService.addMint(url, name)
      // Update random seed for discover section
      setRandomSeed(Date.now())
      loadMints() // Refresh the list
    } catch (error) {
      console.error("Failed to add mint:", error)
      Alert.alert(
        "Error Adding Mint",
        error instanceof Error
          ? error.message
          : "Failed to add mint. Please check the URL and try again.",
      )
    }
  }

  const handleToggleActive = async (url: string, isActive: boolean) => {
    const cashuService = CashuService.getInstance()
    await cashuService.setMintActive(url, isActive)
    loadMints() // Refresh the list
  }

  const handleSetDefault = async (url: string) => {
    const cashuService = CashuService.getInstance()
    await cashuService.setDefaultMint(url)
    loadMints() // Refresh the list
  }

  const handleRemoveMint = async (url: string) => {
    const cashuService = CashuService.getInstance()
    await cashuService.removeMint(url)
    // Update random seed for discover section
    setRandomSeed(Date.now())
    loadMints() // Refresh the list after removal to update the discover section
  }

  const toggleAddForm = () => setIsAddFormOpen(!isAddFormOpen)

  // Add a function to toggle the collapsible section
  const toggleMintsCollapsed = () => setMintsCollapsed(!mintsCollapsed)

  const onRefresh = () => {
    setRefreshing(true)
    // Update the random seed to trigger re-render
    setRandomSeed(Date.now())
    loadMints()
  }

  const renderHeaderContent = () => (
    <View style={styles.headerContent}>
      <AddMintForm
        onAdd={handleAddMint}
        isOpen={isAddFormOpen}
        toggleOpen={toggleAddForm}
      />
      {mints.length > 0 && (
        <TouchableOpacity
          style={styles.collapsibleHeader}
          onPress={toggleMintsCollapsed}
          activeOpacity={0.7}
        >
          <Text style={styles.collapsibleHeaderTitle}>
            Connected Mints ({mints.length})
          </Text>
          <GaloyIcon
            name={mintsCollapsed ? "caret-down" : "caret-up"}
            size={18}
            color={colors.grey0}
          />
        </TouchableOpacity>
      )}
    </View>
  )

  const renderFooterContent = () => (
    <DiscoverMintsSection
      key={`discover-section-${randomSeed}`}
      onAddMint={handleAddMint}
      existingMints={mints}
    />
  )

  // Filter mint data based on collapsed state
  const mintsData = mintsCollapsed ? [] : mints

  return (
    <Screen preset="fixed" style={styles.screen}>
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={mintsData}
          keyExtractor={(item) => item.url}
          renderItem={({ item }) => (
            <MintItem
              mint={item}
              onToggleActive={handleToggleActive}
              onSetDefault={handleSetDefault}
              onRemove={handleRemoveMint}
              balance={mintBalances[item.url] || 0}
            />
          )}
          ListHeaderComponent={renderHeaderContent}
          ListFooterComponent={renderFooterContent}
          ListEmptyComponent={
            mints.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No mints added yet</Text>
                <Text style={styles.emptyStateSubtext}>
                  Add a mint using the button above or discover popular mints below
                </Text>
              </View>
            ) : null // If we have mints but they're collapsed, don't show empty state
          }
          contentContainerStyle={styles.mintsList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  mintsList: {
    padding: 16,
    paddingBottom: 32,
  },
  headerContent: {
    marginBottom: 16,
  },
  cardContainer: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    color: colors.black,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 6,
    color: colors.grey1,
  },
  input: {
    backgroundColor: colors.grey5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 16,
    color: colors.black,
    borderWidth: 1,
    borderColor: "transparent",
  },
  invalidInput: {
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    marginTop: -8,
    marginBottom: 8,
  },
  formButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  cancelButtonText: {
    color: colors.grey1,
    fontSize: 16,
    fontWeight: "500",
  },
  addMintButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
  },
  addMintButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "500",
  },
  disabledButton: {
    backgroundColor: colors.grey3,
  },
  mintItemCard: {
    flexDirection: "row",
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 80,
  },
  mintItemLeftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  mintIconContainer: {
    marginRight: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.grey5,
    justifyContent: "center",
    alignItems: "center",
  },
  mintInfoSection: {
    flex: 1,
  },
  defaultIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  defaultIndicatorText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.success,
    marginLeft: 4,
  },
  setDefaultButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  setDefaultButtonText: {
    fontSize: 12,
    fontWeight: "400",
    color: colors.grey1,
    marginLeft: 4,
  },
  smallLoader: {
    width: 12,
    height: 12,
  },
  mintName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.black,
    marginBottom: 2,
  },
  mintItemRightSection: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  mintBalanceContainer: {
    marginRight: 12,
    alignItems: "flex-end",
    minWidth: 70,
  },
  mintBalanceValue: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.black,
    textAlign: "right",
  },
  mintBalanceUnit: {
    fontSize: 12,
    color: colors.grey1,
    textAlign: "right",
  },
  toggleLoader: {
    marginHorizontal: 8,
  },
  mintRemoveButton: {
    marginLeft: 8,
    padding: 4,
  },
  addButton: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  emptyState: {
    alignItems: "center",
    padding: 24,
    marginTop: 12,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.grey1,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.grey2,
    textAlign: "center",
    marginBottom: 24,
  },
  discoverSection: {
    marginTop: 24,
    marginBottom: 16,
  },
  discoverSectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    color: colors.black,
  },
  discoverSectionSubtitle: {
    fontSize: 14,
    color: colors.grey1,
    marginBottom: 16,
  },
  discoverMintCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  discoverMintContent: {
    flex: 1,
  },
  discoverMintName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.black,
    marginBottom: 4,
  },
  discoverMintUrl: {
    fontSize: 12,
    color: colors.grey1,
    marginBottom: 8,
  },
  discoverMintDescription: {
    fontSize: 14,
    color: colors.grey0,
  },
  discoverMintAction: {
    justifyContent: "center",
    marginLeft: 8,
  },
  addMintBadge: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  addMintBadgeText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 4,
  },
  alreadyAddedBadge: {
    backgroundColor: colors.success,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  alreadyAddedText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 4,
  },
  testingBadge: {
    backgroundColor: colors.warning,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  testingText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 4,
  },
  collapsibleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.grey5,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  collapsibleHeaderTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.grey0,
  },
  allAddedContainer: {
    padding: 16,
    backgroundColor: colors.grey5,
    borderRadius: 12,
    alignItems: "center",
  },
  allAddedText: {
    fontSize: 14,
    color: colors.grey1,
  },
}))
