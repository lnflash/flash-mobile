import React from "react"
import { TouchableOpacity, View } from "react-native"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { ProgressSteps } from "@app/components/account-upgrade-flow"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import {
  IdentityDocumentType as DocumentType,
  setIdentity,
} from "@app/store/redux/slices/accountUpgradeSlice"

// utils
import { removeIdentityFiles } from "@app/utils/identity-files"
import { testProps } from "@app/utils/testProps"

type Props = StackScreenProps<RootStackParamList, "IdentityDocumentType">

type Option = {
  value: DocumentType
  icon: string
  title: string
  desc: string
}

/**
 * ENG-608 step 1: pick the document. The choice decides how many sides the
 * capture step asks for (a passport has no back).
 */
const IdentityDocumentType: React.FC<Props> = ({ navigation, route }) => {
  const dispatch = useAppDispatch()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const resubmit = route.params?.resubmit ?? false

  const { numOfSteps, identity } = useAppSelector((state) => state.accountUpgrade)
  const selected = identity.documentType

  const options: Option[] = [
    {
      value: "passport",
      icon: "airplane",
      title: LL.AccountUpgrade.docPassport(),
      desc: LL.AccountUpgrade.docPassportDesc(),
    },
    {
      value: "national_id",
      icon: "id-card",
      title: LL.AccountUpgrade.docNationalId(),
      desc: LL.AccountUpgrade.docCardDesc(),
    },
    {
      value: "drivers_licence",
      icon: "car",
      title: LL.AccountUpgrade.docDriversLicence(),
      desc: LL.AccountUpgrade.docCardDesc(),
    },
  ]

  const onSelect = (value: DocumentType) => {
    if (value === selected) return
    // Switching document kinds invalidates any captures taken for the old one,
    // in the slice and on disk.
    removeIdentityFiles(identity).catch(() => undefined)
    dispatch(
      setIdentity({
        documentType: value,
        front: undefined,
        back: undefined,
        selfie: undefined,
        uploaded: {},
      }),
    )
  }

  const onPressNext = () => {
    if (!selected) return
    navigation.navigate("IdentityCapture", { side: "front", resubmit })
  }

  return (
    <Screen preset="scroll" style={styles.screen}>
      {!resubmit && (
        <ProgressSteps numOfSteps={numOfSteps} currentStep={numOfSteps - 2} />
      )}
      <View style={styles.container}>
        <Text type="h1" bold>
          {LL.AccountUpgrade.identityDocTitle()}
        </Text>
        <Text type="bm" style={styles.desc}>
          {LL.AccountUpgrade.identityDocDesc()}
        </Text>
        {options.map((opt) => {
          const on = opt.value === selected
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.card, on && styles.cardOn]}
              onPress={() => onSelect(opt.value)}
              {...testProps(`identity-doc-${opt.value}`)}
            >
              <View style={[styles.rowIcon, on && styles.rowIconOn]}>
                <Icon
                  name={opt.icon}
                  size={21}
                  color={on ? colors._white : colors.primary}
                  type="ionicon"
                />
              </View>
              <View style={styles.textWrapper}>
                <Text type="bl" bold>
                  {opt.title}
                </Text>
                <Text type="bm" style={styles.desc}>
                  {opt.desc}
                </Text>
              </View>
              {on && (
                <Icon
                  name="checkmark-circle"
                  size={22}
                  color={colors.primary}
                  type="ionicon"
                />
              )}
            </TouchableOpacity>
          )
        })}
      </View>
      <PrimaryBtn
        label={LL.common.next()}
        disabled={!selected}
        btnStyle={styles.btn}
        onPress={onPressNext}
      />
    </Screen>
  )
}

export default IdentityDocumentType

const useStyles = makeStyles(({ colors }) => ({
  screen: {
    flexGrow: 1,
  },
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
    padding: 14,
    marginVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.grey5,
  },
  cardOn: {
    borderColor: colors.primary,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.grey4,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconOn: {
    backgroundColor: colors.primary,
  },
  textWrapper: {
    flex: 1,
    marginHorizontal: 14,
  },
  btn: {
    marginBottom: 10,
    marginHorizontal: 20,
  },
}))
