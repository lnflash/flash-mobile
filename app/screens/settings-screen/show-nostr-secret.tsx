import ReactNativeModal from "react-native-modal"
import Clipboard from "@react-native-clipboard/clipboard"
import { View, ViewStyle, Alert, ActivityIndicator, Pressable } from "react-native"
import { Text, useTheme } from "@rneui/themed"
import { useEffect, useState } from "react"
import { getPublicKey, nip19 } from "nostr-tools"
import Ionicons from "react-native-vector-icons/Ionicons"
import { getSecretKey } from "@app/utils/nostr"
import useNostrProfile from "@app/hooks/use-nostr-profile"
import { useNavigation } from "@react-navigation/native"
import { useHomeAuthedQuery, useUserUpdateNpubMutation } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { NsecInputForm } from "@app/components/import-nsec/import-nsec-form"
import { useChatContext } from "../nip17-chat/chatContext"

interface ShowNostrSecretProps {
  isActive: boolean
  onCancel: () => void
}

export const ShowNostrSecret: React.FC<ShowNostrSecretProps> = ({
  isActive,
  onCancel,
}) => {
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null)
  const [linked, setLinked] = useState<boolean | null>(null)
  const [updatingNpub, setUpdatingNpub] = useState<boolean>(false)
  const isAuthed = useIsAuthed()
  const {
    data: dataAuthed,
    loading: loadingAuthed,
    refetch,
  } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
    errorPolicy: "all",
    nextFetchPolicy: "network-only",
  })
  const [userUpdateNpub] = useUserUpdateNpubMutation()
  useEffect(() => {
    const initialize = async () => {
      let secret
      if (!secretKey) {
        let secret = await getSecretKey()
        setSecretKey(secret)
      } else {
        secret = secretKey
      }
      if (
        secret &&
        dataAuthed &&
        dataAuthed.me &&
        dataAuthed.me.npub === nip19.npubEncode(getPublicKey(secret))
      ) {
        console.log("LINKED IS", true)
        setLinked(true)
      } else {
        setLinked(false)
      }
    }
    initialize()
  }, [secretKey, dataAuthed])

  const { saveNewNostrKey, deleteNostrKeys } = useNostrProfile()
  let nostrPubKey = ""
  if (secretKey) {
    nostrPubKey = nip19.npubEncode(getPublicKey(secretKey as Uint8Array))
  }

  const {
    theme: { colors },
  } = useTheme()
  const [copiedNsec, setCopiedNsec] = useState(false)
  const [copiedNpub, setCopiedNpub] = useState(false)
  const [hideSecret, setHideSecret] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showImportNsec, setShowImportNsec] = useState(false)
  const { resetChat } = useChatContext()

  const styles = {
    modalStyle: {},
    modalBody: {
      backgroundColor: colors.white,
      justifyContent: "flex-start",
      flexDirection: "column",
      alignItems: "flex-start",
      padding: 20,
      borderRadius: 20,
    },
    idContainer: {
      backgroundColor: colors.grey5,
      borderRadius: 5,
      padding: 10,
      margin: 10,
      width: "100%",
    },
  }

  const copyToClipboard = (copyText: string, handler: (copied: boolean) => void) => {
    Clipboard.setString(copyText)
    handler(true)
    setTimeout(() => {
      handler(false)
    }, 1000)
  }

  const navigation = useNavigation()

  const handleEditProfile = () => {
    onCancel()
    navigation.navigate("EditNostrProfile")
  }

  const handleImportNsec = () => {
    setShowImportNsec(true)
  }

  const handleDeleteKeys = () => {
    Alert.alert(
      "Warning",
      "If you have not backed up these keys, you will lose access to this Nostr account forever. Are you sure you want to delete them?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteNostrKeys()
            setSecretKey(null)
          },
        },
      ],
    )
  }

  return (
    <View>
      <ReactNativeModal
        isVisible={isActive}
        backdropColor={colors.grey5}
        backdropOpacity={0.7}
        onBackButtonPress={onCancel}
        onBackdropPress={onCancel}
        style={styles.modalStyle}
      >
        <View>
          {!!secretKey ? (
            <View style={styles.modalBody as ViewStyle}>
              {updatingNpub ? (
                <ActivityIndicator
                  size="small"
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                  }}
                />
              ) : (
                <Ionicons
                  name={linked ? "link-outline" : "unlink-outline"}
                  size={24}
                  color={linked ? "green" : "red"}
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                  }}
                  onPress={async () => {
                    if (!secretKey) {
                      Alert.alert("No Secret Key exists")
                      return
                    }
                    setUpdatingNpub(true)
                    console.log("POSTING NPUB")
                    const data = await userUpdateNpub({
                      variables: {
                        input: {
                          npub: nip19.npubEncode(getPublicKey(secretKey)),
                        },
                      },
                    })
                    await refetch()
                    setUpdatingNpub(false)
                  }}
                />
              )}
              <Text type="h2">Your nostr address is</Text>
              <View
                style={styles.idContainer as ViewStyle}
                onTouchStart={() => copyToClipboard(nostrPubKey, setCopiedNpub)}
              >
                <Text onPress={() => copyToClipboard(nostrPubKey, setCopiedNpub)}>
                  {nostrPubKey} {"\n"}
                </Text>
                <Ionicons
                  name={copiedNpub ? "checkmark" : "copy-outline"}
                  size={24}
                  onPress={() => copyToClipboard(nostrPubKey, setCopiedNpub)}
                />
              </View>

              <Text type="h2">Your nostr secret is</Text>
              <View style={styles.idContainer as ViewStyle}>
                <Text
                  onPress={() =>
                    copyToClipboard(nip19.nsecEncode(secretKey), setCopiedNsec)
                  }
                >
                  {hideSecret ? "***************" : nip19.nsecEncode(secretKey)} {"\n"}
                </Text>
                <View style={{ flexDirection: "row" }}>
                  <Ionicons
                    name={hideSecret ? "eye" : "eye-off"}
                    size={24}
                    onPress={() => setHideSecret(!hideSecret)}
                    style={{ marginRight: 10 }}
                  />
                  <Ionicons
                    name={copiedNsec ? "checkmark" : "copy-outline"}
                    size={24}
                    onPress={() =>
                      copyToClipboard(nip19.nsecEncode(secretKey), setCopiedNsec)
                    }
                  />
                </View>
              </View>
              <View style={{ width: "100%" }}>
                {showImportNsec ? (
                  <NsecInputForm
                    onSubmit={(nsec, success) => {
                      if (success) {
                        resetChat()
                        setSecretKey(nip19.decode(nsec).data as Uint8Array)
                      }
                    }}
                  />
                ) : null}
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  width: "100%",
                  margin: 10,
                }}
              >
                <Ionicons
                  name="arrow-up-circle-outline"
                  size={20}
                  onPress={handleImportNsec}
                />
                <Ionicons name="trash" size={20} onPress={handleDeleteKeys} />
                <Ionicons name="person-outline" size={20} onPress={handleEditProfile} />
              </View>
            </View>
          ) : (
            <View style={styles.modalBody as ViewStyle}>
              {!isGenerating ? (
                <View>
                  <Text style={{ margin: 20 }}> No Nostr Keys Found </Text>
                  <Pressable
                    onPress={async () => {
                      if (isGenerating) return
                      setIsGenerating(true)
                      let newSecret = await saveNewNostrKey()
                      setSecretKey(newSecret)
                      setIsGenerating(false)
                    }}
                  >
                    <Ionicons
                      name="key"
                      size={20}
                      style={{ opacity: isGenerating ? 0.5 : 1 }}
                    />
                    <Text>Generate Nostr Keys</Text>
                  </Pressable>
                </View>
              ) : (
                <Text>Generating Keys..</Text>
              )}
            </View>
          )}
        </View>
      </ReactNativeModal>
    </View>
  )
}
