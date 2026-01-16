"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrimaryNavigator = exports.PhoneLoginNavigator = exports.ContactNavigator = exports.ChatNavigator = exports.RootStack = void 0;
const bottom_tabs_1 = require("@react-navigation/bottom-tabs");
const stack_1 = require("@react-navigation/stack");
const React = __importStar(require("react"));
const authentication_screen_1 = require("../screens/authentication-screen");
const pin_screen_1 = require("../screens/authentication-screen/pin-screen");
const contacts_screen_1 = require("../screens/contacts-screen");
const card_screen_1 = require("../screens/card-screen");
const chat_1 = require("@app/screens/chat");
const developer_screen_1 = require("../screens/developer-screen");
const earns_screen_1 = require("../screens/earns-screen");
const section_completed_1 = require("../screens/earns-screen/section-completed");
const get_started_screen_1 = require("../screens/get-started-screen");
const home_screen_1 = require("../screens/home-screen");
const map_screen_1 = require("../screens/map-screen/map-screen");
const price_history_screen_1 = require("../screens/price/price-history-screen");
const chat_svg_1 = __importDefault(require("@app/assets/icons/chat.svg"));
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const conversion_flow_1 = require("@app/screens/conversion-flow");
const email_login_screen_1 = require("@app/screens/email-login-screen");
const email_registration_screen_1 = require("@app/screens/email-registration-screen");
const galoy_address_screen_1 = require("@app/screens/galoy-address-screen");
const phone_auth_screen_1 = require("@app/screens/phone-auth-screen");
const phone_registration_input_1 = require("@app/screens/phone-auth-screen/phone-registration-input");
const phone_registration_validation_1 = require("@app/screens/phone-auth-screen/phone-registration-validation");
const receive_screen_1 = __importDefault(require("@app/screens/receive-bitcoin-screen/receive-screen"));
const redeem_bitcoin_detail_screen_1 = __importDefault(require("@app/screens/redeem-lnurl-withdrawal-screen/redeem-bitcoin-detail-screen"));
const redeem_bitcoin_result_screen_1 = __importDefault(require("@app/screens/redeem-lnurl-withdrawal-screen/redeem-bitcoin-result-screen"));
const send_bitcoin_confirmation_screen_1 = __importDefault(require("@app/screens/send-bitcoin-screen/send-bitcoin-confirmation-screen"));
const send_bitcoin_destination_screen_1 = __importDefault(require("@app/screens/send-bitcoin-screen/send-bitcoin-destination-screen"));
const send_bitcoin_details_screen_1 = __importDefault(require("@app/screens/send-bitcoin-screen/send-bitcoin-details-screen"));
const send_bitcoin_success_screen_1 = __importDefault(require("@app/screens/send-bitcoin-screen/send-bitcoin-success-screen"));
const account_1 = require("@app/screens/settings-screen/account");
const default_wallet_1 = require("@app/screens/settings-screen/default-wallet");
const display_currency_screen_1 = require("@app/screens/settings-screen/display-currency-screen");
const theme_screen_1 = require("@app/screens/settings-screen/theme-screen");
const transaction_limits_screen_1 = require("@app/screens/settings-screen/transaction-limits-screen");
const totp_screen_1 = require("@app/screens/totp-screen");
const themed_1 = require("@rneui/themed");
const send_bitcoin_screen_1 = require("../screens/send-bitcoin-screen");
const settings_screen_1 = require("../screens/settings-screen");
const language_screen_1 = require("../screens/settings-screen/language-screen");
const security_screen_1 = require("../screens/settings-screen/security-screen");
const transaction_detail_screen_1 = require("../screens/transaction-detail-screen");
const screens_1 = require("@app/screens");
const persistent_state_1 = require("@app/store/persistent-state");
const notifications_screen_1 = require("@app/screens/settings-screen/notifications-screen");
const welcome_screen_1 = require("../screens/welcome-screen");
const reports_1 = require("@app/screens/reports");
const refund_flow_1 = require("@app/screens/refund-flow");
const messages_1 = require("@app/screens/chat/messages");
const react_native_1 = require("react-native");
const notification_badge_1 = __importDefault(require("./notification-badge"));
const edit_nostr_profile_1 = __importDefault(require("@app/screens/edit-nostr-profile/edit-nostr-profile"));
const home_active_svg_1 = __importDefault(require("@app/assets/icons/home-active.svg"));
const home_inactive_svg_1 = __importDefault(require("@app/assets/icons/home-inactive.svg"));
const map_active_svg_1 = __importDefault(require("@app/assets/icons/map-active.svg"));
const map_inactive_svg_1 = __importDefault(require("@app/assets/icons/map-inactive.svg"));
const scan_qr_svg_1 = __importDefault(require("@app/assets/icons/scan-qr.svg"));
const cashout_screen_1 = require("@app/screens/cashout-screen");
const nostr_settings_screen_1 = require("@app/screens/settings-screen/nostr-settings/nostr-settings-screen");
const contactDetailsScreen_1 = __importDefault(require("@app/screens/chat/contactDetailsScreen"));
const SupportGroupChat_1 = require("@app/screens/chat/GroupChat/SupportGroupChat");
const contacts_1 = __importDefault(require("@app/screens/chat/contacts"));
const post_1 = __importDefault(require("@app/screens/social/post"));
const post_success_1 = __importDefault(require("@app/screens/social/post-success"));
const iris_browser_1 = __importDefault(require("@app/screens/social/iris-browser"));
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
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
}));
const RootNavigator = (0, stack_1.createStackNavigator)();
const RootStack = () => {
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    // Check if intro screen is displayed twice.
    const initialRouteName = isAuthed ? "authenticationCheck" : "getStarted";
    return (<RootNavigator.Navigator initialRouteName={initialRouteName} screenOptions={{
            gestureEnabled: true,
            headerBackTitle: LL.common.back(),
            headerStyle: styles.headerStyle,
            headerTitleStyle: styles.title,
            headerBackTitleStyle: styles.title,
            headerTintColor: colors.black,
            headerShadowVisible: false,
        }}>
      {/* Intro Screen route */}
      <RootNavigator.Screen name="Reconciliation" component={reports_1.ReconciliationReport} options={{ headerShown: true, title: LL.reports.reconciliation() }}/>
      <RootNavigator.Screen name="getStarted" component={get_started_screen_1.GetStartedScreen} options={{ headerShown: false, animationEnabled: false }}/>
      <RootNavigator.Screen name="UsernameSet" component={authentication_screen_1.UsernameSet} options={{ headerShown: false, animationEnabled: false }}/>
      <RootNavigator.Screen name="Welcome" component={authentication_screen_1.Welcome} options={{ headerShown: false, animationEnabled: false }}/>
      <RootNavigator.Screen name="welcomeFirst" component={welcome_screen_1.WelcomeFirstScreen} options={{ headerShown: false }}/>
      <RootNavigator.Screen name="authenticationCheck" component={authentication_screen_1.AuthenticationCheckScreen} options={{ headerShown: false, animationEnabled: false }}/>
      <RootNavigator.Screen name="authentication" component={authentication_screen_1.AuthenticationScreen} options={{ headerShown: false, animationEnabled: false }}/>
      <RootNavigator.Screen name="pin" component={pin_screen_1.PinScreen} options={{ headerShown: false }}/>
      <RootNavigator.Screen name="Primary" component={exports.PrimaryNavigator} options={{
            headerShown: false,
            animationEnabled: false,
            title: LL.PrimaryScreen.title(),
        }}/>
      <RootNavigator.Screen name="scanningQRCode" component={send_bitcoin_screen_1.ScanningQRCodeScreen} options={{
            title: LL.ScanningQRCodeScreen.title(),
            headerShown: false,
            cardStyleInterpolator: stack_1.CardStyleInterpolators.forHorizontalIOS,
        }}/>
      <RootNavigator.Screen name="sendBitcoinDestination" component={send_bitcoin_destination_screen_1.default} options={{
            title: persistentState.isAdvanceMode
                ? LL.SendBitcoinScreen.title()
                : LL.SendBitcoinScreen.send(),
        }}/>
      <RootNavigator.Screen name="sendBitcoinDetails" component={send_bitcoin_details_screen_1.default} options={{
            title: persistentState.isAdvanceMode
                ? LL.SendBitcoinScreen.title()
                : LL.SendBitcoinScreen.send(),
        }}/>
      <RootNavigator.Screen name="sendBitcoinConfirmation" component={send_bitcoin_confirmation_screen_1.default} options={{
            title: persistentState.isAdvanceMode
                ? LL.SendBitcoinScreen.title()
                : LL.SendBitcoinScreen.send(),
        }}/>
      <RootNavigator.Screen name="sendBitcoinSuccess" component={send_bitcoin_success_screen_1.default} options={{
            headerShown: false,
        }}/>
      <RootNavigator.Screen name="receiveBitcoin" component={receive_screen_1.default} options={{
            title: LL.ReceiveScreen.title(),
        }}/>
      <RootNavigator.Screen name="flashcardTopup" component={card_screen_1.FlashcardTopup} options={{
            title: LL.ReceiveScreen.topupFlashcard(),
        }}/>
      <RootNavigator.Screen name="redeemBitcoinDetail" component={redeem_bitcoin_detail_screen_1.default} options={{
            title: LL.RedeemBitcoinScreen.title(),
        }}/>
      <RootNavigator.Screen name="redeemBitcoinResult" component={redeem_bitcoin_result_screen_1.default} options={{
            title: LL.RedeemBitcoinScreen.title(),
        }}/>
      <RootNavigator.Screen name="conversionDetails" component={conversion_flow_1.ConversionDetailsScreen} options={{
            title: LL.ConversionDetailsScreen.title(),
        }}/>
      <RootNavigator.Screen name="conversionConfirmation" component={conversion_flow_1.ConversionConfirmationScreen} options={{
            title: LL.ConversionConfirmationScreen.title(),
        }}/>
      <RootNavigator.Screen name="conversionSuccess" component={conversion_flow_1.ConversionSuccessScreen} options={{
            headerShown: false,
            title: LL.ConversionSuccessScreen.title(),
        }}/>
      <RootNavigator.Screen name="earnsSection" component={earns_screen_1.EarnSection} options={{
            cardStyleInterpolator: stack_1.CardStyleInterpolators.forHorizontalIOS,
            headerStyle: { backgroundColor: colors === null || colors === void 0 ? void 0 : colors._gold },
            headerTintColor: colors._black,
            headerTitleStyle: {
                fontWeight: "bold",
                fontSize: 18,
            },
            headerBackTitleStyle: { color: colors._black },
        }}/>
      <RootNavigator.Screen name="earnsQuiz" component={earns_screen_1.EarnQuiz} options={{
            headerShown: false,
            cardStyleInterpolator: stack_1.CardStyleInterpolators.forVerticalIOS,
        }}/>
      <RootNavigator.Screen name="settings" component={settings_screen_1.SettingsScreen} options={() => ({
            title: LL.SettingsScreen.title(),
        })}/>
      <RootNavigator.Screen name="NostrSettingsScreen" component={nostr_settings_screen_1.NostrSettingsScreen} options={{
            title: "Social Settings",
            headerBackTitleVisible: false,
        }}/>
      <RootNavigator.Screen name="Contacts" component={contacts_1.default} options={{ title: "Contacts" }}/>
      <RootNavigator.Screen name="addressScreen" component={galoy_address_screen_1.GaloyAddressScreen} options={() => ({
            title: "",
        })}/>
      <RootNavigator.Screen name="defaultWallet" component={default_wallet_1.DefaultWalletScreen} options={() => ({
            title: LL.DefaultWalletScreen.title(),
        })}/>
      <RootNavigator.Screen name="theme" component={theme_screen_1.ThemeScreen} options={() => ({
            title: LL.ThemeScreen.title(),
        })}/>
      <RootNavigator.Screen name="language" component={language_screen_1.LanguageScreen} options={{ title: LL.common.languagePreference() }}/>
      <RootNavigator.Screen name="currency" component={display_currency_screen_1.DisplayCurrencyScreen} options={{ title: LL.common.currency() }}/>
      <RootNavigator.Screen name="security" component={security_screen_1.SecurityScreen} options={{ title: LL.common.security() }}/>
      <RootNavigator.Screen name="developerScreen" component={developer_screen_1.DeveloperScreen}/>
      <RootNavigator.Screen name="sectionCompleted" component={section_completed_1.SectionCompleted} options={{
            headerShown: false,
            cardStyleInterpolator: stack_1.CardStyleInterpolators.forVerticalIOS,
        }}/>
      <RootNavigator.Screen name="phoneFlow" component={exports.PhoneLoginNavigator} options={{
            title: LL.PhoneLoginInitiateScreen.title(),
        }}/>
      <RootNavigator.Screen name="phoneRegistrationInitiate" options={{
            title: LL.common.phoneNumber(),
        }} component={phone_registration_input_1.PhoneRegistrationInitiateScreen}/>
      <RootNavigator.Screen name="phoneRegistrationValidate" component={phone_registration_validation_1.PhoneRegistrationValidateScreen} options={{
            title: LL.common.codeConfirmation(),
        }}/>
      <RootNavigator.Screen name="transactionDetail" component={transaction_detail_screen_1.TransactionDetailScreen} options={{
            headerShown: false,
            cardStyleInterpolator: stack_1.CardStyleInterpolators.forModalPresentationIOS,
        }}/>

      <RootNavigator.Screen name="priceHistory" component={price_history_screen_1.PriceHistoryScreen} options={{
            cardStyleInterpolator: stack_1.CardStyleInterpolators.forHorizontalIOS,
            title: LL.common.bitcoinPrice(),
        }}/>
      <RootNavigator.Screen name="accountScreen" component={account_1.AccountScreen} options={{
            title: LL.common.account(),
        }}/>
      <RootNavigator.Screen name="notificationSettingsScreen" component={notifications_screen_1.NotificationSettingsScreen} options={{
            title: LL.NotificationSettingsScreen.title(),
        }}/>
      <RootNavigator.Screen name="transactionLimitsScreen" component={transaction_limits_screen_1.TransactionLimitsScreen} options={{
            title: LL.common.transactionLimits(),
        }}/>
      <RootNavigator.Screen name="emailRegistrationInitiate" component={email_registration_screen_1.EmailRegistrationInitiateScreen} options={{
            title: LL.EmailRegistrationInitiateScreen.title(),
        }}/>
      <RootNavigator.Screen name="emailRegistrationValidate" component={email_registration_screen_1.EmailRegistrationValidateScreen} options={{
            title: LL.common.codeConfirmation(),
        }}/>
      <RootNavigator.Screen name="emailLoginInitiate" component={email_login_screen_1.EmailLoginInitiateScreen} options={{
            title: LL.EmailLoginInitiateScreen.title(),
        }}/>
      <RootNavigator.Screen name="emailLoginValidate" component={email_login_screen_1.EmailLoginValidateScreen} options={{
            title: LL.common.codeConfirmation(),
        }}/>
      <RootNavigator.Screen name="totpRegistrationInitiate" component={totp_screen_1.TotpRegistrationInitiateScreen} options={{
            title: LL.TotpRegistrationInitiateScreen.title(),
        }}/>
      <RootNavigator.Screen name="totpRegistrationValidate" component={totp_screen_1.TotpRegistrationValidateScreen} options={{
            title: LL.TotpRegistrationValidateScreen.title(),
        }}/>
      <RootNavigator.Screen name="totpLoginValidate" component={totp_screen_1.TotpLoginValidateScreen} options={{
            title: LL.TotpLoginValidateScreen.title(),
        }}/>
      <RootNavigator.Group screenOptions={{
            title: "",
            headerShadowVisible: false,
        }}>
        <RootNavigator.Screen name="BackupOptions" component={screens_1.BackupOptions}/>
        <RootNavigator.Screen name="BackupStart" component={screens_1.BackupStart}/>
        <RootNavigator.Screen name="BackupSeedPhrase" component={screens_1.BackupSeedPhrase}/>
        <RootNavigator.Screen name="BackupDoubleCheck" component={screens_1.BackupDoubleCheck}/>
        <RootNavigator.Screen name="BackupVerify" component={screens_1.BackupVerify}/>
        <RootNavigator.Screen name="BackupComplete" component={screens_1.BackupComplete} options={{ headerShown: false }}/>
        <RootNavigator.Screen name="BackupShowSeedPhrase" component={screens_1.BackupShowSeedPhrase}/>
        <RootNavigator.Screen name="ImportWallet" component={screens_1.ImportWallet}/>
        <RootNavigator.Screen name="ImportWalletOptions" component={screens_1.ImportWalletOptions}/>
      </RootNavigator.Group>
      <RootNavigator.Screen name="TransactionHistoryTabs" component={screens_1.TransactionHistoryTabs} options={{ title: LL.TransactionScreen.transactionHistoryTitle() }}/>
      <RootNavigator.Screen name="makeNostrPost" component={post_1.default} options={{ title: LL.Social.postTitle() }}/>
      <RootNavigator.Screen name="postSuccess" component={post_success_1.default} options={{ title: LL.Social.postSuccessTitle(), headerShown: false }}/>
      <RootNavigator.Screen name="irisBrowser" component={iris_browser_1.default} options={{ title: LL.Social.socialFeedTitle(), headerShown: false }}/>
      <RootNavigator.Screen name="USDTransactionHistory" component={screens_1.USDTransactionHistory} options={{ title: LL.TransactionScreen.transactionHistoryTitle() }}/>
      <RootNavigator.Screen name="RefundTransactionList" component={refund_flow_1.RefundTransactionsList} options={{ title: LL.RefundFlow.refundListTitle() }}/>
      <RootNavigator.Screen name="RefundDestination" component={refund_flow_1.RefundDestination} options={{ title: LL.RefundFlow.destinationTitle() }}/>
      <RootNavigator.Screen name="RefundConfirmation" component={refund_flow_1.RefundConfirmation} options={{ title: LL.RefundFlow.confirmationTitle() }}/>
      <RootNavigator.Screen name="Card" component={card_screen_1.CardScreen} options={{ title: "", headerStyle: { backgroundColor: colors.background } }}/>
      <RootNavigator.Screen name="CashoutDetails" component={cashout_screen_1.CashoutDetails} options={{ title: LL.Cashout.title() }}/>
      <RootNavigator.Screen name="CashoutConfirmation" component={cashout_screen_1.CashoutConfirmation} options={{ title: LL.Cashout.title() }}/>
      <RootNavigator.Screen name="CashoutSuccess" component={cashout_screen_1.CashoutSuccess} options={{ headerShown: false }}/>
      <RootNavigator.Screen name="EditNostrProfile" component={edit_nostr_profile_1.default} options={{ headerShown: true, title: LL.Nostr.editProfile() }}/>
      <RootNavigator.Screen name="SignInViaQRCode" component={screens_1.SignInViaQRCode} options={{
            headerStyle: { backgroundColor: "#000" },
            cardStyleInterpolator: stack_1.CardStyleInterpolators.forHorizontalIOS,
        }}/>
      <RootNavigator.Screen name="Nip29GroupChat" component={SupportGroupChat_1.SupportGroupChatScreen} options={{ title: "Group Chat" }}/>
    </RootNavigator.Navigator>);
};
exports.RootStack = RootStack;
const StackChats = (0, stack_1.createStackNavigator)();
const ChatNavigator = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    return (<StackChats.Navigator>
      <StackChats.Screen name="chatList" component={chat_1.ChatList} options={{
            title: LL.ChatScreen.title(),
            headerShown: false,
        }}/>
      <StackChats.Screen name="messages" component={messages_1.Messages} options={{ headerShown: false }}/>
      <StackChats.Screen name="contactDetails" component={contactDetailsScreen_1.default} options={{
            headerShown: true,
            title: "Contact Details",
            headerBackTitleVisible: false,
        }}/>
    </StackChats.Navigator>);
};
exports.ChatNavigator = ChatNavigator;
const StackContacts = (0, stack_1.createStackNavigator)();
const ContactNavigator = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    return (<StackContacts.Navigator>
      <StackContacts.Screen name="contactList" component={contacts_screen_1.ContactsScreen} options={{
            title: LL.ContactsScreen.title(),
            headerShown: false,
        }}/>
      <StackContacts.Screen name="contactDetail" component={contacts_screen_1.ContactsDetailScreen} options={{ headerShown: false }}/>
    </StackContacts.Navigator>);
};
exports.ContactNavigator = ContactNavigator;
const StackPhoneValidation = (0, stack_1.createStackNavigator)();
const PhoneLoginNavigator = () => (<StackPhoneValidation.Navigator screenOptions={{ headerShown: false }}>
    <StackPhoneValidation.Screen name="phoneLoginInitiate" component={phone_auth_screen_1.PhoneLoginInitiateScreen}/>
    <StackPhoneValidation.Screen name="phoneLoginValidate" component={phone_auth_screen_1.PhoneLoginValidationScreen}/>
  </StackPhoneValidation.Navigator>);
exports.PhoneLoginNavigator = PhoneLoginNavigator;
const Tab = (0, bottom_tabs_1.createBottomTabNavigator)();
const PrimaryNavigator = () => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    return (<Tab.Navigator initialRouteName="Home" screenOptions={{
            tabBarActiveTintColor: colors.tabActive,
            tabBarInactiveTintColor: colors.tabInactive,
            tabBarStyle: styles.bottomNavigatorStyle,
            tabBarLabelStyle: { paddingBottom: 6, fontSize: 12, fontWeight: "bold" },
            tabBarHideOnKeyboard: true,
        }}>
      <Tab.Screen name="Home" component={home_screen_1.HomeScreen} options={{
            headerTitle: "",
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.background },
            title: LL.HomeScreen.title(),
            tabBarAccessibilityLabel: LL.HomeScreen.title(),
            tabBarTestID: LL.HomeScreen.title(),
            tabBarIcon: ({ focused }) => (focused ? <home_active_svg_1.default /> : <home_inactive_svg_1.default />),
        }}/>
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
      {persistentState.chatEnabled ? (<Tab.Screen name="Chat" component={exports.ChatNavigator} options={{
                headerShown: false,
                title: LL.ChatScreen.title(),
                tabBarIcon: ({ color }) => (<react_native_1.View>
                <chat_svg_1.default color={color}/>
                <notification_badge_1.default />
              </react_native_1.View>),
            }}/>) : null}
      <Tab.Screen name="Map" component={map_screen_1.MapScreen} options={{
            title: LL.MapScreen.title(),
            headerShown: false,
            tabBarAccessibilityLabel: LL.MapScreen.title(),
            tabBarTestID: LL.MapScreen.title(),
            tabBarIcon: ({ focused }) => (focused ? <map_active_svg_1.default /> : <map_inactive_svg_1.default />),
        }}/>
      <Tab.Screen name="Scan" component={send_bitcoin_screen_1.ScanningQRCodeScreen} options={{
            title: LL.ScanningQRCodeScreen.title(),
            headerShown: true,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: "#000" },
            tabBarAccessibilityLabel: LL.MapScreen.title(),
            tabBarTestID: LL.MapScreen.title(),
            tabBarIcon: () => <scan_qr_svg_1.default />,
            tabBarStyle: { display: "none" },
        }}/>
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
    </Tab.Navigator>);
};
exports.PrimaryNavigator = PrimaryNavigator;
//# sourceMappingURL=root-navigator.js.map