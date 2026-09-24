import React from "react"
import { Image, View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { PrimaryBtn } from "../buttons"
import { useI18nContext } from "@app/i18n/i18n-react"
import { testProps } from "@app/utils/testProps"

type Props = {
  /** `file://` URI of the still to show. */
  uri: string
  title: string
  onRetake: () => void
  onAccept: () => void
  /** Disables both buttons while the still is being moved into place. */
  busy?: boolean
}

/** Full-screen look at the still just taken, with Retake / Use photo. */
const CapturePreview: React.FC<Props> = ({ uri, title, onRetake, onAccept, busy }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { top, bottom } = useSafeAreaInsets()

  return (
    <View
      style={[styles.container, { paddingTop: top + 12, paddingBottom: bottom + 12 }]}
    >
      <Text type="h1" bold style={styles.title}>
        {title}
      </Text>
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="contain"
        {...testProps("capture-preview-image")}
      />
      <View style={styles.actions}>
        <PrimaryBtn
          type="outline"
          label={LL.AccountUpgrade.retake()}
          onPress={onRetake}
          disabled={busy}
          btnStyle={styles.btn}
        />
        <PrimaryBtn
          label={LL.AccountUpgrade.usePhoto()}
          onPress={onAccept}
          disabled={busy}
          loading={busy}
          btnStyle={styles.btn}
        />
      </View>
    </View>
  )
}

export default CapturePreview

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingHorizontal: 20,
  },
  title: {
    color: "#fff",
    textAlign: "center",
    marginBottom: 12,
  },
  image: {
    flex: 1,
    width: "100%",
    borderRadius: 12,
    backgroundColor: colors.black,
  },
  actions: {
    flexDirection: "row",
    marginTop: 16,
    columnGap: 12,
  },
  btn: {
    flex: 1,
  },
}))
