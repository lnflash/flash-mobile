"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedSettings = void 0;
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const styles_1 = require("./styles");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const react_1 = require("react");
const utils_1 = require("@noble/curves/abstract/utils");
const nostr_tools_1 = require("nostr-tools");
const generated_1 = require("@app/graphql/generated");
const use_nostr_profile_1 = __importDefault(require("@app/hooks/use-nostr-profile"));
const import_nsec_modal_1 = require("@app/components/import-nsec/import-nsec-modal");
const chatContext_1 = require("@app/screens/chat/chatContext");
const key_modal_1 = require("./key-modal");
const native_1 = require("@react-navigation/native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const nostr_1 = require("@app/utils/nostr");
const AdvancedSettings = ({ expandAdvanced, secretKeyHex, copyToClipboard, onReconnect, accountLinked, }) => {
    const styles = (0, styles_1.useStyles)();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    // Grab contactsEvent and pool from context
    const { resetChat, refreshUserProfile, contactsEvent, poolRef } = (0, chatContext_1.useChatContext)();
    const [showSecretModal, setShowSecretModal] = (0, react_1.useState)(false);
    const [keysModalType, setKeysModalType] = (0, react_1.useState)("public");
    const [updatingNpub, setUpdatingNpub] = (0, react_1.useState)(false);
    const [creatingContacts, setCreatingContacts] = (0, react_1.useState)(false);
    const [importModalVisible, setImportModalVisible] = (0, react_1.useState)(false);
    const [userUpdateNpub] = (0, generated_1.useUserUpdateNpubMutation)();
    const { deleteNostrKeys } = (0, use_nostr_profile_1.default)();
    const navigation = (0, native_1.useNavigation)();
    const handleShowKeys = (type) => {
        setKeysModalType(type);
        setShowSecretModal(true);
    };
    const handleReconnectNostr = async () => {
        if (!secretKeyHex) {
            react_native_1.Alert.alert(LL.Nostr.noProfileIdExists());
            return;
        }
        const secretKey = (0, utils_1.hexToBytes)(secretKeyHex);
        setUpdatingNpub(true);
        const data = await userUpdateNpub({
            variables: {
                input: {
                    npub: nostr_tools_1.nip19.npubEncode((0, nostr_tools_1.getPublicKey)(secretKey)),
                },
            },
        });
        await onReconnect();
        setUpdatingNpub(false);
        react_native_1.Alert.alert(LL.common.success(), LL.Nostr.profileReconnected());
    };
    const handleDeleteNostr = () => {
        react_native_1.Alert.alert(LL.Nostr.deleteWarningTitle(), LL.Nostr.deleteWarningMessage(), [
            { text: LL.common.cancel(), style: "cancel" },
            {
                text: LL.support.delete(),
                style: "destructive",
                onPress: async () => {
                    await deleteNostrKeys();
                    await refreshUserProfile();
                    await resetChat();
                    navigation.goBack();
                },
            },
        ]);
    };
    const handleCreateContactList = () => {
        react_native_1.Alert.alert(LL.Nostr.Contacts.createContactList() || "Create Contact List?", "WARNING: We couldn't find an existing contact list. Creating a new one may overwrite any list found later on other relays and delete those connections.\n\nOnly proceed if you are sure this is a new account or you have no contacts.", [
            {
                text: LL.common.cancel(),
                style: "cancel",
            },
            {
                text: "Create & Overwrite",
                style: "destructive",
                onPress: async () => {
                    try {
                        setCreatingContacts(true);
                        // Call your utility function
                        console.log("Creating contact list");
                        await (0, nostr_1.createContactListEvent)((0, utils_1.hexToBytes)(secretKeyHex));
                        // Refresh the context to see the new list immediately
                        react_native_1.Alert.alert(LL.common.success(), "Contact list created successfully.");
                        await refreshUserProfile();
                        setCreatingContacts(false);
                    }
                    catch (error) {
                        console.error(error);
                        react_native_1.Alert.alert(LL.common.error(), "Failed to create contact list.");
                    }
                    finally {
                        setCreatingContacts(false);
                    }
                },
            },
        ]);
    };
    // --- NEW: Create Contact List Logic ---
    const handleViewContacts = () => {
        // Navigate to the existing Contacts screen
        // Ensure "Contacts" is in your RootStackParamList
        // Pass userPrivateKey as string if the screen requires it
        navigation.navigate("Contacts", { userPrivateKey: secretKeyHex });
    };
    const contactSectionText = contactsEvent
        ? LL.Nostr.Contacts.manageContacts()
        : LL.Nostr.Contacts.createContactList();
    return (<react_native_1.View>
      {expandAdvanced && (<react_native_1.View style={styles.advancedContainer}>
          {/* Learn More */}
          <react_native_1.Pressable style={[styles.advancedMenuItem]} onPress={() => react_native_1.Linking.openURL("https://documentation.getflash.io/en/guides/chat")}>
            <react_native_1.View style={styles.menuIconContainer}>
              <Ionicons_1.default name="book-outline" size={24} color="#3366cc"/>
            </react_native_1.View>
            <react_native_1.View style={{ flex: 1 }}>
              <themed_1.Text style={styles.menuText}>{LL.Nostr.learnAboutNostr()}</themed_1.Text>
              <themed_1.Text style={styles.menuSubtext}>{LL.Nostr.learnAboutNostrSubtext()}</themed_1.Text>
            </react_native_1.View>
            <Ionicons_1.default name="open-outline" size={24} color="#3366cc"/>
          </react_native_1.Pressable>
          <react_native_1.Pressable style={styles.advancedMenuItem} onPress={contactsEvent ? handleViewContacts : handleCreateContactList}>
            <react_native_1.View style={styles.menuIconContainer}>
              {creatingContacts ? (<react_native_1.ActivityIndicator size="small"/>) : (<Ionicons_1.default name={contactsEvent ? "people-outline" : "people-circle-outline"} size={24}/>)}
            </react_native_1.View>
            <themed_1.Text style={styles.menuText}>{contactSectionText}</themed_1.Text>
            {contactsEvent ? (<Ionicons_1.default name="chevron-forward" size={24} color={colors.grey3}/>) : null}
          </react_native_1.Pressable>

          {/* Show Public Key */}
          <react_native_1.Pressable style={styles.advancedMenuItem} onPress={() => handleShowKeys("public")}>
            <react_native_1.View style={styles.menuIconContainer}>
              <Ionicons_1.default name="key-outline" size={24} color={colors.black}/>
            </react_native_1.View>
            <themed_1.Text style={styles.menuText}>{LL.Nostr.showPublicKey()}</themed_1.Text>
            <Ionicons_1.default name="chevron-forward" size={24} color={colors.grey3}/>
          </react_native_1.Pressable>

          {/* Show Private Key */}
          <react_native_1.Pressable style={styles.advancedMenuItem} onPress={() => handleShowKeys("private")}>
            <react_native_1.View style={styles.menuIconContainer}>
              <Ionicons_1.default name="lock-closed-outline" size={24} color={colors.black}/>
            </react_native_1.View>
            <themed_1.Text style={styles.menuText}>{LL.Nostr.showPrivateKey()}</themed_1.Text>
            <Ionicons_1.default name="chevron-forward" size={24} color={colors.grey3}/>
          </react_native_1.Pressable>

          {/* Reconnect Nostr Account */}
          <react_native_1.Pressable style={[styles.advancedMenuItem]} onPress={handleReconnectNostr}>
            <react_native_1.View style={styles.menuIconContainer}>
              {updatingNpub ? (<react_native_1.ActivityIndicator size="small" color={colors.black}/>) : (<Ionicons_1.default name={accountLinked ? "checkmark-circle-outline" : "sync-outline"} size={24} color={accountLinked ? "green" : colors.black}/>)}
            </react_native_1.View>
            <react_native_1.View style={{ flex: 1 }}>
              <themed_1.Text style={styles.menuText}>
                {accountLinked
                ? LL.Nostr.profileConnected()
                : LL.Nostr.reconnectProfile()}
              </themed_1.Text>
              {accountLinked && (<themed_1.Text style={styles.menuSubtext}>
                  {LL.Nostr.tapToRefreshConnection()}
                </themed_1.Text>)}
            </react_native_1.View>
          </react_native_1.Pressable>

          {/* Import Nostr Account */}
          <react_native_1.Pressable style={styles.advancedMenuItem} onPress={() => setImportModalVisible(true)}>
            <react_native_1.View style={styles.menuIconContainer}>
              <Ionicons_1.default name="download-outline" size={24} color={colors.black}/>
            </react_native_1.View>
            <themed_1.Text style={styles.menuText}>{LL.Nostr.importExistingProfile()}</themed_1.Text>
            <Ionicons_1.default name="chevron-forward" size={24} color={colors.grey3}/>
          </react_native_1.Pressable>

          {/* Delete Nostr Account */}
          <react_native_1.Pressable style={styles.advancedMenuItem} onPress={handleDeleteNostr}>
            <react_native_1.View style={styles.menuIconContainer}>
              <Ionicons_1.default name="trash-outline" size={24} color="red"/>
            </react_native_1.View>
            <themed_1.Text style={[styles.menuText, { color: "red" }]}>
              {LL.Nostr.deleteProfile()}
            </themed_1.Text>
            <Ionicons_1.default name="chevron-forward" size={24} color={colors.grey3}/>
          </react_native_1.Pressable>
        </react_native_1.View>)}
      <import_nsec_modal_1.ImportNsecModal isActive={importModalVisible} onCancel={() => setImportModalVisible(false)} onSubmit={() => {
            resetChat();
            setImportModalVisible(false);
            react_native_1.Alert.alert(LL.common.success(), LL.Nostr.profileImportedSuccessfully());
        }} descriptionText={LL.Nostr.importNsecDescription()}/>
      <key_modal_1.KeyModal isOpen={showSecretModal} secretKeyHex={secretKeyHex} onClose={() => setShowSecretModal(false)} copyToClipboard={copyToClipboard} keysModalType={keysModalType}/>
    </react_native_1.View>);
};
exports.AdvancedSettings = AdvancedSettings;
//# sourceMappingURL=advanced-settings.js.map