import React, { useState, useEffect, useCallback } from "react"
import {
  Modal,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
  SafeAreaView,
} from "react-native"
import { SearchBar, ListItem, Text, makeStyles, useTheme } from "@rneui/themed"
import Contacts from "react-native-contacts"
import {
  PERMISSIONS,
  request,
  check,
  RESULTS,
  openSettings,
} from "react-native-permissions"
import Icon from "react-native-vector-icons/Ionicons"
import { useI18nContext } from "@app/i18n/i18n-react"

interface PhoneNumber {
  label: string
  number: string
}

interface EmailAddress {
  label: string
  email: string
}

interface Contact {
  givenName: string
  familyName: string
  phoneNumbers: PhoneNumber[]
  emailAddresses: EmailAddress[]
  recordID: string
}

interface ContactPickerProps {
  visible: boolean
  onClose: () => void
  onSelectContact: (value: string, type: "phone" | "email") => void
}

export const ContactPicker: React.FC<ContactPickerProps> = ({
  visible,
  onClose,
  onSelectContact,
}) => {
  const styles = useStyles()
  const { theme } = useTheme()
  const { LL } = useI18nContext()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([])
  const [searchText, setSearchText] = useState("")
  const [loading, setLoading] = useState(false)
  const [permissionGranted, setPermissionGranted] = useState(false)

  // Request permission and load contacts when modal opens
  useEffect(() => {
    if (visible) {
      checkAndRequestPermission()
    }
  }, [visible])

  const checkAndRequestPermission = async () => {
    try {
      const permission = Platform.select({
        ios: PERMISSIONS.IOS.CONTACTS,
        android: PERMISSIONS.ANDROID.READ_CONTACTS,
      })

      if (!permission) return

      const result = await check(permission)

      if (result === RESULTS.GRANTED) {
        setPermissionGranted(true)
        loadContacts()
      } else if (result === RESULTS.BLOCKED) {
        // Permission was previously denied and can't be requested
        // On iOS, we can open settings
        Alert.alert(
          LL.common.permissionDenied?.() || "Permission Denied",
          LL.common.contactsPermissionDeniedMessage?.() ||
            "Contacts permission has been denied. Please enable it in Settings.",
          [
            { text: LL.common.cancel?.() || "Cancel", onPress: onClose, style: "cancel" },
            {
              text: LL.common.openSettings?.() || "Open Settings",
              onPress: () => {
                openSettings().catch(() => {
                  console.warn("Cannot open settings")
                })
                onClose()
              },
            },
          ],
        )
      } else {
        // Request permission - this should show the native dialog
        const requestResult = await request(permission)

        if (requestResult === RESULTS.GRANTED) {
          setPermissionGranted(true)
          loadContacts()
        } else if (requestResult === RESULTS.BLOCKED) {
          // User denied and selected "Don't ask again" or permission is blocked
          Alert.alert(
            LL.common.permissionDenied?.() || "Permission Denied",
            LL.common.contactsPermissionDeniedMessage?.() ||
              "Contacts permission has been denied. Please enable it in Settings.",
            [
              {
                text: LL.common.cancel?.() || "Cancel",
                onPress: onClose,
                style: "cancel",
              },
              {
                text: LL.common.openSettings?.() || "Open Settings",
                onPress: () => {
                  openSettings().catch(() => {
                    console.warn("Cannot open settings")
                  })
                  onClose()
                },
              },
            ],
          )
        } else {
          // User denied but can ask again later
          onClose()
        }
      }
    } catch (error) {
      console.error("Error checking permissions:", error)
      Alert.alert(
        LL.common.error?.() || "Error",
        "Failed to check permissions. Please try again.",
      )
    }
  }

  const loadContacts = async () => {
    setLoading(true)
    try {
      Contacts.getAll()
        .then((contactsList) => {
          // Filter contacts with phone numbers or email addresses and sort alphabetically
          const contactsWithContactInfo = contactsList
            .filter(
              (contact) =>
                (contact.phoneNumbers && contact.phoneNumbers.length > 0) ||
                (contact.emailAddresses && contact.emailAddresses.length > 0),
            )
            .map((contact) => ({
              givenName: contact.givenName || "",
              familyName: contact.familyName || "",
              phoneNumbers:
                contact.phoneNumbers?.map((phone) => ({
                  label: phone.label || "mobile",
                  number: phone.number,
                })) || [],
              emailAddresses:
                contact.emailAddresses?.map((email) => ({
                  label: email.label || "personal",
                  email: email.email,
                })) || [],
              recordID: contact.recordID,
            }))
            .sort((a, b) => {
              const nameA = `${a.givenName} ${a.familyName}`.toLowerCase()
              const nameB = `${b.givenName} ${b.familyName}`.toLowerCase()
              return nameA.localeCompare(nameB)
            })

          setContacts(contactsWithContactInfo)
          setFilteredContacts(contactsWithContactInfo)
        })
        .catch((error) => {
          console.error("Error loading contacts:", error)
          Alert.alert(
            LL.common.error?.() || "Error",
            LL.common.errorLoadingContacts?.() ||
              "Failed to load contacts. Please try again.",
          )
        })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = useCallback(
    (text: string) => {
      setSearchText(text)
      if (text.trim() === "") {
        setFilteredContacts(contacts)
      } else {
        const filtered = contacts.filter((contact) => {
          const fullName = `${contact.givenName} ${contact.familyName}`.toLowerCase()
          const searchLower = text.toLowerCase()
          return (
            fullName.includes(searchLower) ||
            contact.phoneNumbers.some((phone) =>
              phone.number.replace(/\D/g, "").includes(text.replace(/\D/g, "")),
            ) ||
            contact.emailAddresses.some((email) =>
              email.email.toLowerCase().includes(searchLower),
            )
          )
        })
        setFilteredContacts(filtered)
      }
    },
    [contacts],
  )

  const handleSelectContact = (contact: Contact) => {
    const totalPhones = contact.phoneNumbers.length
    const totalEmails = contact.emailAddresses.length
    const totalOptions = totalPhones + totalEmails

    // Case a: Only one phone number and no email
    if (totalPhones === 1 && totalEmails === 0) {
      onSelectContact(contact.phoneNumbers[0].number, "phone")
      onClose()
      return
    }

    // Case e: No phone numbers and only one email
    if (totalPhones === 0 && totalEmails === 1) {
      onSelectContact(contact.emailAddresses[0].email, "email")
      onClose()
      return
    }

    // For all other cases, show selection dialog
    const options = []

    // Add phone numbers to options
    contact.phoneNumbers.forEach((phone) => {
      options.push({
        text: `📱 ${phone.label}: ${phone.number}`,
        onPress: () => {
          onSelectContact(phone.number, "phone")
          onClose()
        },
      })
    })

    // Add email addresses to options
    contact.emailAddresses.forEach((email) => {
      options.push({
        text: `✉️ ${email.label}: ${email.email}`,
        onPress: () => {
          onSelectContact(email.email, "email")
          onClose()
        },
      })
    })

    // Add cancel button
    options.push({ text: LL.common.cancel?.() || "Cancel", style: "cancel" })

    // Show the selection dialog
    Alert.alert(
      LL.common.selectContactMethod?.() || "Select Contact Method",
      undefined,
      options,
    )
  }

  const renderContact = ({ item }: { item: Contact }) => {
    const fullName = `${item.givenName} ${item.familyName}`.trim()

    // Build display text for contact methods
    let contactDisplay = ""
    const totalContacts = item.phoneNumbers.length + item.emailAddresses.length

    if (totalContacts === 1) {
      // Show the single contact method
      if (item.phoneNumbers.length === 1) {
        contactDisplay = item.phoneNumbers[0].number
      } else if (item.emailAddresses.length === 1) {
        contactDisplay = item.emailAddresses[0].email
      }
    } else {
      // Show count of contact methods
      const parts = []
      if (item.phoneNumbers.length > 0) {
        parts.push(
          `${item.phoneNumbers.length} phone${item.phoneNumbers.length > 1 ? "s" : ""}`,
        )
      }
      if (item.emailAddresses.length > 0) {
        parts.push(
          `${item.emailAddresses.length} email${
            item.emailAddresses.length > 1 ? "s" : ""
          }`,
        )
      }
      contactDisplay = parts.join(", ")
    }

    return (
      <ListItem
        onPress={() => handleSelectContact(item)}
        bottomDivider
        containerStyle={styles.contactItem}
      >
        <ListItem.Content>
          <ListItem.Title style={styles.contactName}>{fullName}</ListItem.Title>
          <ListItem.Subtitle style={styles.contactPhone}>
            {contactDisplay}
          </ListItem.Subtitle>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>
    )
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon name="close" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          <Text type="h3" style={styles.title}>
            {LL.common.selectContact?.() || "Select Contact"}
          </Text>
          <View style={styles.closeButton} />
        </View>

        <SearchBar
          placeholder={LL.common.searchContacts?.() || "Search contacts..."}
          value={searchText}
          onChangeText={handleSearch}
          platform="default"
          containerStyle={styles.searchContainer}
          inputContainerStyle={styles.searchInputContainer}
        />

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredContacts}
            renderItem={renderContact}
            keyExtractor={(item) => item.recordID}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {searchText
                    ? LL.common.noContactsFound?.() || "No contacts found"
                    : LL.common.noContactsWithPhone?.() ||
                      "No contacts with phone numbers"}
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
  },
  searchContainer: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  searchInputContainer: {
    backgroundColor: colors.searchBg || colors.grey5,
  },
  listContainer: {
    flexGrow: 1,
  },
  contactItem: {
    backgroundColor: colors.background,
  },
  contactName: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.black,
  },
  contactPhone: {
    fontSize: 14,
    color: colors.grey3,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 16,
    color: colors.grey3,
    textAlign: "center",
  },
}))
