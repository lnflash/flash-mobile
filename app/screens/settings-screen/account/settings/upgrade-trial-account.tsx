import { useState } from "react"
import { View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"

// components
import ContactModal, {
  SupportChannels,
} from "@app/components/contact-modal/contact-modal"
import { PrimaryBtn } from "@app/components/buttons"
import { GaloyIcon } from "@app/components/atomic/galoy-icon"
import { UpgradeAccountModal } from "@app/components/upgrade-account-modal"
import { GaloySecondaryButton } from "@app/components/atomic/galoy-secondary-button"

// hooks
import { useShowWarningSecureAccount } from "../show-warning-secure-account-hook"
import { AccountLevel, useLevel } from "@app/graphql/level-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useAppConfig } from "@app/hooks"

export const UpgradeTrialAccount: React.FC = () => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { currentLevel } = useLevel()
  const { appConfig } = useAppConfig()

  const hasBalance = useShowWarningSecureAccount()

  const [upgradeAccountModalVisible, setUpgradeAccountModalVisible] = useState(false)
  const [isContactModalVisible, setIsContactModalVisible] = useState(false)

  const { name: bankName } = appConfig.galoyInstance

  const closeUpgradeAccountModal = () => setUpgradeAccountModalVisible(false)
  const openUpgradeAccountModal = () => setUpgradeAccountModalVisible(true)
  const toggleContactModal = () => setIsContactModalVisible(!isContactModalVisible)

  if (currentLevel === AccountLevel.Zero) {
    return (
      <>
        <UpgradeAccountModal
          isVisible={upgradeAccountModalVisible}
          closeModal={closeUpgradeAccountModal}
        />
        <View style={styles.container}>
          <View style={styles.sideBySide}>
            <Text type="h2" bold>
              {LL.common.trialAccount()}
            </Text>
            <GaloyIcon name="warning" size={30} />
          </View>
          <Text type="p3">{LL.AccountScreen.itsATrialAccount()}</Text>
          {hasBalance && (
            <Text type="p3">⚠️ {LL.AccountScreen.fundsMoreThan5Dollars()}</Text>
          )}
          <GaloySecondaryButton
            title={LL.common.backupAccount()}
            iconName="caret-right"
            iconPosition="right"
            containerStyle={styles.selfCenter}
            onPress={openUpgradeAccountModal}
          />
        </View>
      </>
    )
  } else if (currentLevel === AccountLevel.One) {
    const messageBody = LL.TransactionLimitsScreen.contactUsMessageBody({
      bankName,
    })
    const messageSubject = LL.TransactionLimitsScreen.contactUsMessageSubject()

    return (
      <>
        <PrimaryBtn
          label={LL.TransactionLimitsScreen.requestBusiness()}
          btnStyle={{ marginTop: 10 }}
          onPress={toggleContactModal}
        />
        <ContactModal
          isVisible={isContactModalVisible}
          toggleModal={toggleContactModal}
          messageBody={messageBody}
          messageSubject={messageSubject}
          supportChannelsToHide={[
            SupportChannels.Mattermost,
            SupportChannels.StatusPage,
            SupportChannels.Discord,
          ]}
        />
      </>
    )
  } else {
    return null
  }
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    borderRadius: 20,
    backgroundColor: colors.grey5,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    rowGap: 10,
  },
  selfCenter: { alignSelf: "center" },
  sideBySide: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 4,
  },
}))
