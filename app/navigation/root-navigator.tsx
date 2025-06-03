import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { CardStyleInterpolators, createStackNavigator } from "@react-navigation/stack"
import * as React from "react"

import {
  AuthenticationCheckScreen,
  AuthenticationScreen,
  UsernameSet,
  Welcome,
} from "../screens/authentication-screen"
import { PinScreen } from "../screens/authentication-screen/pin-screen"
import { ContactsDetailScreen, ContactsScreen } from "../screens/contacts-screen"
import { CardScreen, FlashcardTopup } from "../screens/card-screen"
import { ChatList } from "@app/screens/nip17-chat"
import { DeveloperScreen } from "../screens/developer-screen"
import { EarnMapScreen } from "../screens/earns-map-screen"
import { EarnQuiz, EarnSection } from "../screens/earns-screen"
import { SectionCompleted } from "../screens/earns-screen/section-completed"
import { GetStartedScreen } from "../screens/get-started-screen"
import { HomeScreen } from "../screens/home-screen"
import { MapScreen } from "../screens/map-screen/map-screen"
import { PriceHistoryScreen } from "../screens/price/price-history-screen"
import ChatIcon from "@app/assets/icons/chat.svg"
import CardIcon from "@app/assets/icons/nfc.svg"
import ContactsIcon from "@app/assets/icons/contacts.svg"
import HomeIcon from "@app/assets/icons/home.svg"
import LearnIcon from "@app/assets/icons/learn.svg"
import MapIcon from "@app/assets/icons/map.svg"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import {
  ConversionConfirmationScreen,
  ConversionDetailsScreen,
  ConversionSuccessScreen,
} from "@app/screens/conversion-flow"
import {
  EmailLoginInitiateScreen,
  EmailLoginValidateScreen,
} from "@app/screens/email-login-screen"
import {
  EmailRegistrationInitiateScreen,
  EmailRegistrationValidateScreen,
} from "@app/screens/email-registration-screen"
import { GaloyAddressScreen } from "@app/screens/galoy-address-screen"
import {
  PhoneLoginInitiateScreen,
  PhoneLoginValidationScreen,
} from "@app/screens/phone-auth-screen"
import { PhoneRegistrationInitiateScreen } from "@app/screens/phone-auth-screen/phone-registration-input"
import { PhoneRegistrationValidateScreen } from "@app/screens/phone-auth-screen/phone-registration-validation"
import ReceiveScreen from "@app/screens/receive-bitcoin-screen/receive-screen"
import RedeemBitcoinDetailScreen from "@app/screens/redeem-lnurl-withdrawal-screen/redeem-bitcoin-detail-screen"
import RedeemBitcoinResultScreen from "@app/screens/redeem-lnurl-withdrawal-screen/redeem-bitcoin-result-screen"
import SendBitcoinConfirmationScreen from "@app/screens/send-bitcoin-screen/send-bitcoin-confirmation-screen"
import SendBitcoinDestinationScreen from "@app/screens/send-bitcoin-screen/send-bitcoin-destination-screen"
import SendBitcoinDetailsScreen from "@app/screens/send-bitcoin-screen/send-bitcoin-details-screen"
import SendBitcoinSuccessScreen from "@app/screens/send-bitcoin-screen/send-bitcoin-success-screen"
import { AccountScreen } from "@app/screens/settings-screen/account"
import { DefaultWalletScreen } from "@app/screens/settings-screen/default-wallet"
import { DisplayCurrencyScreen } from "@app/screens/settings-screen/display-currency-screen"
import { ThemeScreen } from "@app/screens/settings-screen/theme-screen"
import { TransactionLimitsScreen } from "@app/screens/settings-screen/transaction-limits-screen"
import {
  TotpLoginValidateScreen,
  TotpRegistrationInitiateScreen,
  TotpRegistrationValidateScreen,
} from "@app/screens/totp-screen"
import { testProps } from "@app/utils/testProps"
import { makeStyles, useTheme } from "@rneui/themed"
import { ScanningQRCodeScreen } from "../screens/send-bitcoin-screen"
import { SettingsScreen } from "../screens/settings-screen"
import { LanguageScreen } from "../screens/settings-screen/language-screen"
import { SecurityScreen } from "../screens/settings-screen/security-screen"
import { TransactionDetailScreen } from "../screens/transaction-detail-screen"
import {
  ChatStackParamList,
  ContactStackParamList,
  PhoneValidationStackParamList,
  PrimaryStackParamList,
  RootStackParamList,
} from "./stack-param-lists"
import {
  BackupComplete,
  BackupDoubleCheck,
  BackupSeedPhrase,
  BackupShowSeedPhrase,
  BackupStart,
  BackupVerify,
  ImportWalletOptions,
  ImportWallet,
  BackupOptions,
  TransactionHistoryTabs,
  USDTransactionHistory,
} from "@app/screens"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { NotificationSettingsScreen } from "@app/screens/settings-screen/notifications-screen"
import { WelcomeFirstScreen } from "../screens/welcome-screen"
import { ReconciliationReport } from "@app/screens/reports"
import {
  RefundConfirmation,
  RefundDestination,
  RefundTransactionsList,
} from "@app/screens/refund-flow"
import { Messages } from "@app/screens/nip17-chat/messages"
import { View } from "react-native"
import NotificationBadge from "./notification-badge"
import EditNostrProfileScreen from "@app/screens/edit-nostr-profile/edit-nostr-profile"

import HomeActive from "@app/assets/icons/home-active.svg"
import HomeInactive from "@app/assets/icons/home-inactive.svg"
import CardActive from "@app/assets/icons/card-active.svg"
import CardInactive from "@app/assets/icons/card-inactive.svg"
import MapActive from "@app/assets/icons/map-active.svg"
import MapInactive from "@app/assets/icons/map-inactive.svg"
import ScanQR from "@app/assets/icons/scan-qr.svg"
import {
  CashoutDetails,
  CashoutConfirmation,
  CashoutSuccess,
} from "@app/screens/cashout-screen"

const useStyles = makeStyles(({ colors }) => ({
  bottomNavigatorStyle: {
    minHeight: 60,
    paddingTop: 4,
    backgroundColor: colors.white,
    borderTopColor: colors.grey4,
  },
  headerStyle: {
    backgroundColor: colors.white,
  },
  title: {
    color: colors.black,
  },
}))

const RootNavigator = createStackNavigator<RootStackParamList>()

export const RootStack = () => {
  const { persistentState } = usePersistentStateContext()
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const styles = useStyles()
  const isAuthed = useIsAuthed()

  // Check if intro screen is displayed twice.
  const initialRouteName = isAuthed ? "authenticationCheck" : "getStarted"

  return (
    <RootNavigator.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        gestureEnabled: true,
        headerBackTitle: LL.common.back(),
        headerStyle: styles.headerStyle,
        headerTitleStyle: styles.title,
        headerBackTitleStyle: styles.title,
        headerTintColor: colors.black,
        headerShadowVisible: false,
      }}
    >
      {/* Intro Screen route */}
      <RootNavigator.Screen
        name="Reconciliation"
        component={ReconciliationReport}
        options={{ headerShown: true, title: LL.reports.reconciliation() }}
      />
      <RootNavigator.Screen
        name="getStarted"
        component={GetStartedScreen}
        options={{ headerShown: false, animationEnabled: false }}
      />
      <RootNavigator.Screen
        name="UsernameSet"
        component={UsernameSet}
        options={{ headerShown: false, animationEnabled: false }}
      />
      <RootNavigator.Screen
        name="Welcome"
        component={Welcome}
        options={{ headerShown: false, animationEnabled: false }}
      />
      <RootNavigator.Screen
        name="welcomeFirst"
        component={WelcomeFirstScreen}
        options={{ headerShown: false }}
      />
      <RootNavigator.Screen
        name="authenticationCheck"
        component={AuthenticationCheckScreen}
        options={{ headerShown: false, animationEnabled: false }}
      />
      <RootNavigator.Screen
        name="authentication"
        component={AuthenticationScreen}
        options={{ headerShown: false, animationEnabled: false }}
      />
      <RootNavigator.Screen
        name="pin"
        component={PinScreen}
        options={{ headerShown: false }}
      />
      <RootNavigator.Screen
        name="Primary"
        component={PrimaryNavigator}
        options={{
          headerShown: false,
          animationEnabled: false,
          title: LL.PrimaryScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="scanningQRCode"
        component={ScanningQRCodeScreen}
        options={{
          title: LL.ScanningQRCodeScreen.title(),
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        }}
      />
      <RootNavigator.Screen
        name="sendBitcoinDestination"
        component={SendBitcoinDestinationScreen}
        options={{
          title: persistentState.isAdvanceMode
            ? LL.SendBitcoinScreen.title()
            : LL.SendBitcoinScreen.send(),
        }}
      />
      <RootNavigator.Screen
        name="sendBitcoinDetails"
        component={SendBitcoinDetailsScreen}
        options={{
          title: persistentState.isAdvanceMode
            ? LL.SendBitcoinScreen.title()
            : LL.SendBitcoinScreen.send(),
        }}
      />
      <RootNavigator.Screen
        name="sendBitcoinConfirmation"
        component={SendBitcoinConfirmationScreen}
        options={{
          title: persistentState.isAdvanceMode
            ? LL.SendBitcoinScreen.title()
            : LL.SendBitcoinScreen.send(),
        }}
      />
      <RootNavigator.Screen
        name="sendBitcoinSuccess"
        component={SendBitcoinSuccessScreen}
        options={{
          headerShown: false,
        }}
      />
      <RootNavigator.Screen
        name="receiveBitcoin"
        component={ReceiveScreen}
        options={{
          title: LL.ReceiveScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="flashcardTopup"
        component={FlashcardTopup}
        options={{
          title: LL.ReceiveScreen.topupFlashcard(),
        }}
      />
      <RootNavigator.Screen
        name="redeemBitcoinDetail"
        component={RedeemBitcoinDetailScreen}
        options={{
          title: LL.RedeemBitcoinScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="redeemBitcoinResult"
        component={RedeemBitcoinResultScreen}
        options={{
          title: LL.RedeemBitcoinScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="conversionDetails"
        component={ConversionDetailsScreen}
        options={{
          title: LL.ConversionDetailsScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="conversionConfirmation"
        component={ConversionConfirmationScreen}
        options={{
          title: LL.ConversionConfirmationScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="conversionSuccess"
        component={ConversionSuccessScreen}
        options={{
          headerShown: false,
          title: LL.ConversionSuccessScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="earnsSection"
        component={EarnSection}
        options={{
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          headerStyle: { backgroundColor: colors?._gold },
          headerTintColor: colors._black,
          headerTitleStyle: {
            fontWeight: "bold",
            fontSize: 18,
          },
          headerBackTitleStyle: { color: colors._black },
        }}
      />
      <RootNavigator.Screen
        name="earnsQuiz"
        component={EarnQuiz}
        options={{
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forVerticalIOS,
        }}
      />
      <RootNavigator.Screen
        name="settings"
        component={SettingsScreen}
        options={() => ({
          title: LL.SettingsScreen.title(),
        })}
      />
      <RootNavigator.Screen
        name="addressScreen"
        component={GaloyAddressScreen}
        options={() => ({
          title: "",
        })}
      />
      <RootNavigator.Screen
        name="defaultWallet"
        component={DefaultWalletScreen}
        options={() => ({
          title: LL.DefaultWalletScreen.title(),
        })}
      />
      <RootNavigator.Screen
        name="theme"
        component={ThemeScreen}
        options={() => ({
          title: LL.ThemeScreen.title(),
        })}
      />
      <RootNavigator.Screen
        name="language"
        component={LanguageScreen}
        options={{ title: LL.common.languagePreference() }}
      />
      <RootNavigator.Screen
        name="currency"
        component={DisplayCurrencyScreen}
        options={{ title: LL.common.currency() }}
      />
      <RootNavigator.Screen
        name="security"
        component={SecurityScreen}
        options={{ title: LL.common.security() }}
      />
      <RootNavigator.Screen name="developerScreen" component={DeveloperScreen} />
      <RootNavigator.Screen
        name="sectionCompleted"
        component={SectionCompleted}
        options={{
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forVerticalIOS,
        }}
      />
      <RootNavigator.Screen
        name="phoneFlow"
        component={PhoneLoginNavigator}
        options={{
          title: LL.PhoneLoginInitiateScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="phoneRegistrationInitiate"
        options={{
          title: LL.common.phoneNumber(),
        }}
        component={PhoneRegistrationInitiateScreen}
      />
      <RootNavigator.Screen
        name="phoneRegistrationValidate"
        component={PhoneRegistrationValidateScreen}
        options={{
          title: LL.common.codeConfirmation(),
        }}
      />
      <RootNavigator.Screen
        name="transactionDetail"
        component={TransactionDetailScreen}
        options={{
          headerTitle: "",
          headerLeft: () => null,
          cardStyleInterpolator: CardStyleInterpolators.forModalPresentationIOS,
        }}
      />

      <RootNavigator.Screen
        name="priceHistory"
        component={PriceHistoryScreen}
        options={{
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          title: LL.common.bitcoinPrice(),
        }}
      />
      <RootNavigator.Screen
        name="accountScreen"
        component={AccountScreen}
        options={{
          title: LL.common.account(),
        }}
      />
      <RootNavigator.Screen
        name="notificationSettingsScreen"
        component={NotificationSettingsScreen}
        options={{
          title: LL.NotificationSettingsScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="transactionLimitsScreen"
        component={TransactionLimitsScreen}
        options={{
          title: LL.common.transactionLimits(),
        }}
      />
      <RootNavigator.Screen
        name="emailRegistrationInitiate"
        component={EmailRegistrationInitiateScreen}
        options={{
          title: LL.EmailRegistrationInitiateScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="emailRegistrationValidate"
        component={EmailRegistrationValidateScreen}
        options={{
          title: LL.common.codeConfirmation(),
        }}
      />
      <RootNavigator.Screen
        name="emailLoginInitiate"
        component={EmailLoginInitiateScreen}
        options={{
          title: LL.EmailLoginInitiateScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="emailLoginValidate"
        component={EmailLoginValidateScreen}
        options={{
          title: LL.common.codeConfirmation(),
        }}
      />
      <RootNavigator.Screen
        name="totpRegistrationInitiate"
        component={TotpRegistrationInitiateScreen}
        options={{
          title: LL.TotpRegistrationInitiateScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="totpRegistrationValidate"
        component={TotpRegistrationValidateScreen}
        options={{
          title: LL.TotpRegistrationValidateScreen.title(),
        }}
      />
      <RootNavigator.Screen
        name="totpLoginValidate"
        component={TotpLoginValidateScreen}
        options={{
          title: LL.TotpLoginValidateScreen.title(),
        }}
      />
      <RootNavigator.Group
        screenOptions={{
          title: "",
          headerShadowVisible: false,
        }}
      >
        <RootNavigator.Screen name="BackupOptions" component={BackupOptions} />
        <RootNavigator.Screen name="BackupStart" component={BackupStart} />
        <RootNavigator.Screen name="BackupSeedPhrase" component={BackupSeedPhrase} />
        <RootNavigator.Screen name="BackupDoubleCheck" component={BackupDoubleCheck} />
        <RootNavigator.Screen name="BackupVerify" component={BackupVerify} />
        <RootNavigator.Screen
          name="BackupComplete"
          component={BackupComplete}
          options={{ headerShown: false }}
        />
        <RootNavigator.Screen
          name="BackupShowSeedPhrase"
          component={BackupShowSeedPhrase}
        />
        <RootNavigator.Screen name="ImportWallet" component={ImportWallet} />
        <RootNavigator.Screen
          name="ImportWalletOptions"
          component={ImportWalletOptions}
        />
      </RootNavigator.Group>
      <RootNavigator.Screen
        name="TransactionHistoryTabs"
        component={TransactionHistoryTabs}
        options={{ title: LL.TransactionScreen.transactionHistoryTitle() }}
      />
      <RootNavigator.Screen
        name="USDTransactionHistory"
        component={USDTransactionHistory}
        options={{ title: LL.TransactionScreen.transactionHistoryTitle() }}
      />
      <RootNavigator.Screen
        name="RefundTransactionList"
        component={RefundTransactionsList}
        options={{ title: LL.RefundFlow.refundListTitle() }}
      />
      <RootNavigator.Screen
        name="RefundDestination"
        component={RefundDestination}
        options={{ title: LL.RefundFlow.destinationTitle() }}
      />
      <RootNavigator.Screen
        name="RefundConfirmation"
        component={RefundConfirmation}
        options={{ title: LL.RefundFlow.confirmationTitle() }}
      />
      <RootNavigator.Screen
        name="Card"
        component={CardScreen}
        options={{ title: "", headerStyle: { backgroundColor: colors.background } }}
      />
      <RootNavigator.Screen
        name="CashoutDetails"
        component={CashoutDetails}
        options={{ title: LL.Cashout.title() }}
      />
      <RootNavigator.Screen
        name="CashoutConfirmation"
        component={CashoutConfirmation}
        options={{ title: LL.Cashout.title() }}
      />
      <RootNavigator.Screen
        name="CashoutSuccess"
        component={CashoutSuccess}
        options={{ headerShown: false }}
      />
      <RootNavigator.Screen
        name="EditNostrProfile"
        component={EditNostrProfileScreen}
        options={{ headerShown: true, title: LL.Nostr.editProfile() }}
      />
    </RootNavigator.Navigator>
  )
}

const StackChats = createStackNavigator<ChatStackParamList>()

export const ChatNavigator = () => {
  const { LL } = useI18nContext()
  return (
    <StackChats.Navigator>
      <StackChats.Screen
        name="chatList"
        component={ChatList}
        options={{
          title: LL.ChatScreen.title(),
          headerShown: false,
        }}
      />
      <StackChats.Screen
        name="messages"
        component={Messages}
        options={{ headerShown: false }}
      />
    </StackChats.Navigator>
  )
}

const StackContacts = createStackNavigator<ContactStackParamList>()

export const ContactNavigator = () => {
  const { LL } = useI18nContext()
  return (
    <StackContacts.Navigator>
      <StackContacts.Screen
        name="contactList"
        component={ContactsScreen}
        options={{
          title: LL.ContactsScreen.title(),
          headerShown: false,
        }}
      />
      <StackContacts.Screen
        name="contactDetail"
        component={ContactsDetailScreen}
        options={{ headerShown: false }}
      />
    </StackContacts.Navigator>
  )
}
const StackPhoneValidation = createStackNavigator<PhoneValidationStackParamList>()

export const PhoneLoginNavigator = () => (
  <StackPhoneValidation.Navigator screenOptions={{ headerShown: false }}>
    <StackPhoneValidation.Screen
      name="phoneLoginInitiate"
      component={PhoneLoginInitiateScreen}
    />
    <StackPhoneValidation.Screen
      name="phoneLoginValidate"
      component={PhoneLoginValidationScreen}
    />
  </StackPhoneValidation.Navigator>
)

const Tab = createBottomTabNavigator<PrimaryStackParamList>()

export const PrimaryNavigator = () => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { persistentState } = usePersistentStateContext()

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: styles.bottomNavigatorStyle,
        tabBarLabelStyle: { paddingBottom: 6, fontSize: 12, fontWeight: "bold" },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerTitle: "",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          title: LL.HomeScreen.title(),
          tabBarAccessibilityLabel: LL.HomeScreen.title(),
          tabBarTestID: LL.HomeScreen.title(),
          tabBarIcon: ({ focused }) => (focused ? <HomeActive /> : <HomeInactive />),
        }}
      />
      {/* <Tab.Screen
        name="Contacts"
        component={ContactNavigator}
        options={{
          headerShown: false,
          title: LL.ContactsScreen.title(),
          tabBarAccessibilityLabel: LL.ContactsScreen.title(),
          tabBarTestID: LL.ContactsScreen.title(),
          tabBarIcon: ({ color }) => (
            <ContactsIcon {...testProps("Contacts")} color={color} />
          ),
        }}
      /> */}
      {persistentState.chatEnabled ? (
        <Tab.Screen
          name="Chat"
          component={ChatNavigator}
          options={{
            headerShown: false,
            title: LL.ChatScreen.title(),
            tabBarIcon: ({ color }) => (
              <View>
                <ChatIcon color={color} />
                <NotificationBadge />
              </View>
            ),
          }}
        />
      ) : null}
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          title: LL.MapScreen.title(),
          headerShown: false,
          tabBarAccessibilityLabel: LL.MapScreen.title(),
          tabBarTestID: LL.MapScreen.title(),
          tabBarIcon: ({ focused }) => (focused ? <MapActive /> : <MapInactive />),
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanningQRCodeScreen}
        options={{
          title: LL.ScanningQRCodeScreen.title(),
          headerShown: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: "#000" },
          tabBarAccessibilityLabel: LL.MapScreen.title(),
          tabBarTestID: LL.MapScreen.title(),
          tabBarIcon: () => <ScanQR />,
          tabBarStyle: { display: "none" },
        }}
      />
      {/* <Tab.Screen
        name="Earn"
        component={EarnMapScreen}
        options={{
          title: LL.EarnScreen.title(),
          headerShown: false,
          tabBarAccessibilityLabel: LL.EarnScreen.title(),
          tabBarTestID: LL.EarnScreen.title(),
          tabBarIcon: ({ color }) => <LearnIcon {...testProps("Earn")} color={color} />,
        }}
      /> */}
    </Tab.Navigator>
  )
}
