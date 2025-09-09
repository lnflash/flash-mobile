import React from "react"
import Modal from "react-native-modal"
import { Icon, makeStyles, Text } from "@rneui/themed"
import { Dimensions, Linking, TouchableOpacity, View } from "react-native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackNavigationProp } from "@react-navigation/stack"

// hooks
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"

// components
import { PrimaryBtn } from "../buttons"

const width = Dimensions.get("screen").width

type Props = {
  selectedItem: any
  setSelectedItem: (val: any) => void
}

export const CalloutModal: React.FC<Props> = ({ selectedItem, setSelectedItem }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, "Primary">>()
  const isAuthed = useIsAuthed()
  const styles = useStyles()
  const { LL } = useI18nContext()

  const openInGoogleMaps = () => {
    if (selectedItem.mapInfo.coordinates) {
      const url = `https://www.google.com/maps/search/?api=1&query=${selectedItem.mapInfo.coordinates.latitude},${selectedItem.mapInfo.coordinates.longitude}`
      Linking.openURL(url)
    }
  }

  const onPressPay = () => {
    const domain = selectedItem.source === "blink" ? "@blink.sv" : "@flashapp.me"
    const usernameWithDomain = `${selectedItem.username}${domain}`
    if (isAuthed && selectedItem?.username) {
      navigation.navigate("sendBitcoinDestination", {
        username: usernameWithDomain,
      })
    } else {
      navigation.navigate("phoneFlow")
    }
  }

  return (
    <Modal
      isVisible={!!selectedItem}
      animationIn={"fadeIn"}
      animationOut={"fadeOut"}
      backdropOpacity={0.8}
      backdropTransitionOutTiming={0}
      avoidKeyboard={true}
      onBackdropPress={() => setSelectedItem(null)}
      style={{ alignItems: "center", justifyContent: "center" }}
    >
      {selectedItem && (
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.closeIcon}
            onPress={() => setSelectedItem(null)}
          >
            <Icon type="ionicon" name={"close"} size={30} />
          </TouchableOpacity>
          <View style={{ paddingHorizontal: 15, paddingBottom: 5 }}>
            <Text type="h1" bold style={styles.title}>
              {selectedItem.mapInfo.title}
            </Text>
            <PrimaryBtn
              label={LL.MapScreen.payBusiness()}
              onPress={() => {
                onPressPay()
                setSelectedItem(null) // close after action
              }}
              btnStyle={{ height: 45, marginBottom: 10 }}
            />
            <PrimaryBtn
              label={LL.MapScreen.getDirections()}
              onPress={() => {
                openInGoogleMaps()
                setSelectedItem(null)
              }}
              btnStyle={{ height: 45, marginBottom: 10 }}
            />
          </View>
        </View>
      )}
    </Modal>
  )
}

const useStyles = makeStyles(() => ({
  modalContainer: {
    width: width - 100,
    padding: 5,
    borderRadius: 12,
    backgroundColor: "white",
  },
  closeIcon: {
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  title: {
    marginBottom: 10,
    textAlign: "center",
  },
}))
