import React, { useState } from "react"
import { KeyboardAvoidingView, Modal, Platform, ScrollView, TouchableOpacity, View } from "react-native"
import { Icon, Text, makeStyles, useTheme } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useI18nContext } from "@app/i18n/i18n-react"

import { InputField, DropDownField } from "@app/components/account-upgrade-flow"
import { PrimaryBtn } from "@app/components/buttons"

type BridgeKycModalProps = {
  visible: boolean
  onClose: () => void
  onSubmit: (data: { fullName: string; email: string; kycType: string }) => void
}

const BridgeKycModal: React.FC<BridgeKycModalProps> = ({ visible, onClose, onSubmit }) => {
  const styles = useStyles()
  const { colors, mode } = useTheme().theme
  const bottom = useSafeAreaInsets().bottom
  const { LL } = useI18nContext()

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [kycType, setKycType] = useState("")

  const [fullNameErr, setFullNameErr] = useState<string | undefined>()
  const [emailErr, setEmailErr] = useState<string | undefined>()
  const [kycTypeErr, setKycTypeErr] = useState<string | undefined>()

  const kycTypeOptions = [
    { label: LL.BridgeKyc.individual(), value: "individual" },
    { label: LL.BridgeKyc.business(), value: "business" },
  ]

  const validate = (): boolean => {
    let isValid = true

    if (!fullName.trim()) {
      setFullNameErr(LL.BridgeKyc.fullNameRequired())
      isValid = false
    }

    if (!email.trim()) {
      setEmailErr(LL.BridgeKyc.emailRequired())
      isValid = false
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailErr(LL.BridgeKyc.invalidEmail())
      isValid = false
    }

    if (!kycType) {
      setKycTypeErr(LL.BridgeKyc.kycTypeRequired())
      isValid = false
    }

    return isValid
  }

  const handleSubmit = () => {
    if (!validate()) return
    onSubmit({ fullName: fullName.trim(), email: email.trim(), kycType })
  }

  const handleClose = () => {
    setFullName("")
    setEmail("")
    setKycType("")
    setFullNameErr(undefined)
    setEmailErr(undefined)
    setKycTypeErr(undefined)
    onClose()
  }

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={handleClose}>
      <TouchableOpacity
        style={[
          styles.backdrop,
          {
            backgroundColor: mode === "dark" ? "rgba(57,57,57,.7)" : "rgba(0,0,0,.5)",
          },
        ]}
        activeOpacity={1}
        onPress={handleClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardAvoid}
        >
          <View
            style={[
              styles.modalContainer,
              { backgroundColor: colors.white, paddingBottom: bottom || 20 },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text type="h01">{LL.BridgeKyc.title()}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                <Icon name="close" size={30} color={colors.black} type="ionicon" />
              </TouchableOpacity>
            </View>

            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              <Text type="p2" color={colors.grey2} style={styles.description}>
                {LL.BridgeKyc.description()}
              </Text>

              <InputField
                label={LL.BridgeKyc.fullName()}
                placeholder={LL.BridgeKyc.fullNamePlaceholder()}
                value={fullName}
                errorMsg={fullNameErr}
                autoCapitalize="words"
                onChangeText={(val) => {
                  setFullNameErr(undefined)
                  setFullName(val)
                }}
              />

              <InputField
                label={LL.BridgeKyc.email()}
                placeholder={LL.BridgeKyc.emailPlaceholder()}
                value={email}
                errorMsg={emailErr}
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={(val) => {
                  setEmailErr(undefined)
                  setEmail(val)
                }}
              />

              <DropDownField
                label={LL.BridgeKyc.kycType()}
                placeholder={LL.BridgeKyc.kycTypePlaceholder()}
                data={kycTypeOptions}
                value={kycType}
                errorMsg={kycTypeErr}
                onChange={(val) => {
                  setKycTypeErr(undefined)
                  setKycType(val)
                }}
              />
            </ScrollView>

            <PrimaryBtn
              label={LL.BridgeKyc.submit()}
              onPress={handleSubmit}
              btnStyle={styles.submitBtn}
            />
          </View>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  )
}

export default BridgeKycModal

const useStyles = makeStyles(({ colors }) => ({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  keyboardAvoid: {
    justifyContent: "flex-end",
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  closeBtn: {
    padding: 5,
  },
  description: {
    marginBottom: 20,
  },
  submitBtn: {
    marginTop: 10,
  },
}))
