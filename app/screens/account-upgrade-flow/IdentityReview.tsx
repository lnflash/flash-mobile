import React, { useState } from "react"
import { Image, TouchableOpacity, View } from "react-native"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { ProgressSteps } from "@app/components/account-upgrade-flow"

// hooks
import { useAccountUpgrade } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

// store
import { useAppSelector } from "@app/store/redux"
import { IdentitySide } from "@app/store/redux/slices/accountUpgradeSlice"

// utils
import { hasAllCaptures, requiredSides } from "@app/utils/identity-verification"
import { testProps } from "@app/utils/testProps"

type Props = StackScreenProps<RootStackParamList, "IdentityReview">

/**
 * ENG-608 step 3: thumbnails of every capture with a retake on each. Pressing
 * confirm is the first moment any photo leaves the phone. In the normal flow
 * it uploads and moves on to the business/bank steps; on a resubmit the rest
 * of the request is already on file, so it uploads and submits in one go.
 */
const IdentityReview: React.FC<Props> = ({ navigation, route }) => {
  const resubmit = route.params?.resubmit ?? false
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { uploadEvidence, submitAccountUpgrade } = useAccountUpgrade()

  const { numOfSteps, identity } = useAppSelector((state) => state.accountUpgrade)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string>()
  const [failedSide, setFailedSide] = useState<IdentitySide>()

  const sides = requiredSides(identity.documentType)
  const complete = hasAllCaptures(identity)

  const labels: Record<IdentitySide, string> = {
    front: LL.AccountUpgrade.reviewFront(),
    back: LL.AccountUpgrade.reviewBack(),
    selfie: LL.AccountUpgrade.reviewSelfie(),
  }

  const onEdit = (side: IdentitySide) => {
    setErrorMsg(undefined)
    setFailedSide(undefined)
    navigation.push("IdentityCapture", { side, resubmit, returnToReview: true })
  }

  const onConfirm = async () => {
    if (!complete || busy) return
    setBusy(true)
    setErrorMsg(undefined)
    setFailedSide(undefined)
    try {
      if (resubmit) {
        const res = await submitAccountUpgrade()
        if (res.success) {
          navigation.replace("AccountUpgradeSuccess", { resubmitted: true })
        } else {
          setErrorMsg(res.errors?.join(", ") || LL.AccountUpgrade.uploadFailed())
        }
        return
      }
      const res = await uploadEvidence()
      if (res.success) {
        navigation.navigate("BusinessInformation")
      } else {
        setFailedSide(res.failedSide)
        setErrorMsg(LL.AccountUpgrade.uploadFailed())
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen preset="scroll" style={{ flexGrow: 1 }}>
      {!resubmit && (
        <ProgressSteps numOfSteps={numOfSteps} currentStep={numOfSteps - 2} />
      )}
      <View style={styles.container}>
        <Text type="h1" bold>
          {LL.AccountUpgrade.reviewTitle()}
        </Text>
        <Text type="bm" style={styles.desc}>
          {LL.AccountUpgrade.reviewDesc()}
        </Text>
        {sides.map((side) => {
          const image = identity[side]
          const failed = failedSide === side
          return (
            <View
              key={side}
              style={[styles.card, failed && styles.cardFailed]}
              {...testProps(`identity-review-${side}`)}
            >
              <View style={styles.thumbWrapper}>
                {image ? (
                  <Image
                    source={{ uri: image.uri }}
                    style={styles.thumb}
                    resizeMode="cover"
                    {...testProps(`identity-thumb-${side}`)}
                  />
                ) : (
                  <Icon
                    name="image-outline"
                    size={28}
                    color={colors.grey2}
                    type="ionicon"
                  />
                )}
              </View>
              <View style={styles.textWrapper}>
                <Text type="bl" bold>
                  {labels[side]}
                </Text>
                {!image && (
                  <Text type="bm" style={styles.missing}>
                    {LL.AccountUpgrade.reviewMissing()}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.action}
                onPress={() => onEdit(side)}
                {...testProps(`identity-edit-${side}`)}
              >
                <Text style={styles.actionText}>{LL.AccountUpgrade.retake()}</Text>
                <Icon name="camera" size={16} color={colors.primary} type="ionicon" />
              </TouchableOpacity>
            </View>
          )
        })}
        {!!errorMsg && (
          <Text type="bm" style={styles.error} {...testProps("identity-review-error")}>
            {errorMsg}
          </Text>
        )}
      </View>
      <PrimaryBtn
        label={
          errorMsg
            ? LL.AccountUpgrade.uploadRetry()
            : resubmit
            ? LL.AccountUpgrade.confirmSubmit()
            : LL.AccountUpgrade.confirmContinue()
        }
        disabled={!complete}
        loading={busy}
        btnStyle={styles.btn}
        onPress={onConfirm}
      />
    </Screen>
  )
}

export default IdentityReview

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  desc: {
    marginTop: 2,
    marginBottom: 12,
    color: colors.grey1,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.grey5,
    padding: 12,
    marginVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.grey5,
  },
  cardFailed: {
    borderColor: colors._orange,
  },
  thumbWrapper: {
    width: 84,
    height: 60,
    borderRadius: 10,
    backgroundColor: colors.grey4,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  textWrapper: {
    flex: 1,
    marginHorizontal: 14,
  },
  missing: {
    marginTop: 2,
    color: colors.grey1,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  actionText: {
    color: colors.primary,
    fontWeight: "600",
    marginRight: 4,
  },
  error: {
    color: colors._orange,
    marginTop: 10,
  },
  btn: {
    marginBottom: 10,
    marginHorizontal: 20,
  },
}))
