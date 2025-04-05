import { DisplayCurrency, MoneyAmount, WalletOrDisplayCurrency } from "@app/types/amounts"
import { AuthenticationScreenPurpose, PinScreenPurpose } from "../utils/enum"
import {
  CashoutOffer,
  PhoneCodeChannelType,
  TransactionFragment,
  Wallet,
  WalletCurrency,
} from "@app/graphql/generated"
import { EarnSectionType } from "@app/screens/earns-screen/sections"
import { PaymentDetail } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import {
  PaymentDestination,
  ReceiveDestination,
} from "@app/screens/send-bitcoin-screen/payment-destination/index.types"
import { WalletDescriptor } from "@app/types/wallets"
import _Map from "@app/assets/icons-redesign/map.svg"
import { Event } from "nostr-tools"

export type RootStackParamList = {
  Reconciliation: { from: string; to: string }
  IntroScreen: undefined
  getStarted: undefined
  UsernameSet: undefined
  Welcome: undefined
  welcomeFirst: undefined
  liteDeviceAccount: {
    appCheckToken: string
  }
  developerScreen: undefined
  authenticationCheck: undefined
  authentication: {
    screenPurpose: AuthenticationScreenPurpose
    isPinEnabled: boolean
  }
  pin: { screenPurpose: PinScreenPurpose }
  Primary: undefined
  earnsSection: { section: EarnSectionType }
  earnsQuiz: { id: string }
  scanningQRCode?: { swapAddress: string; amount: number; fee: number; feeType: string }
  settings: undefined
  addressScreen: undefined
  defaultWallet: undefined
  theme: undefined
  sendBitcoinDestination: {
    payment?: string
    username?: string
  }
  cardScreen: {
    reloadlnurl?: string
  }
  sendBitcoinDetails: {
    paymentDestination: PaymentDestination
    flashUserAddress?: string
  }
  sendBitcoinConfirmation: {
    paymentDetail: PaymentDetail<WalletCurrency>
    flashUserAddress?: string
    feeRateSatPerVbyte?: number
  }
  conversionDetails: undefined
  conversionConfirmation: {
    moneyAmount: MoneyAmount<WalletOrDisplayCurrency>
    sendingFee: number
    receivingFee: number
    lnInvoice: string
    fromWalletCurrency: WalletCurrency
  }
  conversionSuccess: undefined
  sendBitcoinSuccess: {
    unitOfAccountAmount: MoneyAmount<WalletOrDisplayCurrency>
    walletCurrency: WalletCurrency
  }
  language: undefined
  currency: undefined
  security: {
    mIsBiometricsEnabled: boolean
    mIsPinEnabled: boolean
  }
  lnurl: { username: string }
  sectionCompleted: { amount: number; sectionTitle: string }
  priceHistory: undefined
  receiveBitcoin: undefined
  flashcardTopup: { flashcardLnurl: string }
  redeemBitcoinDetail: {
    receiveDestination: ReceiveDestination
    paymentFlow?: string
  }
  redeemBitcoinResult: {
    success: boolean
    paymentFlow?: string
    error?: string
  }
  transactionDetail: {
    txid: string
    walletId: string
  }
  breezTransactionDetail: {
    id: string
  }
  loginWithBiometrics: undefined
  phoneFlow: undefined
  phoneRegistrationInitiate: undefined
  phoneRegistrationValidate: {
    phone: string
    channel: PhoneCodeChannelType
  }
  totpRegistrationInitiate: { deviceId: string; appCheckToken: string }
  totpRegistrationValidate: {
    deviceId: string
    appCheckToken: string
    totpSecret: string
  }
  totpLoginValidate: {
    deviceId: string
    appCheckToken: string
    totpSecret: string
    twoFAProvider: "TOTP"
  }
  accountScreen: undefined
  notificationSettingsScreen: undefined
  transactionLimitsScreen: undefined
  emailRegistrationInitiate: undefined
  emailRegistrationValidate: { email: string; emailRegistrationId: string }
  emailLoginInitiate: undefined
  emailLoginValidate: { email: string; emailLoginId: string }
  totpRegistrationInitiate: undefined
  totpRegistrationValidate: { totpRegistrationId: string }
  totpLoginValidate: { authToken: string }
  phoneRegistrationInitiate: { deviceId: string; appCheckToken: string }
  phoneRegistrationValidate: {
    phoneNumber: string
    deviceId: string
    appCheckToken: string
    channel: PhoneCodeChannelType
  }
  phoneLoginInitiate: { deviceId: string; appCheckToken: string }
  phoneLoginValidate: {
    phoneNumber: string
    deviceId: string
    appCheckToken: string
    channel: PhoneCodeChannelType
  }
  walletOverview: undefined
  BTCTransactionHistory: undefined
  USDTransactionHistory: undefined
  TransactionHistoryTabs: { initialRouteName?: string }
  walletNotifications: undefined
  nip05: undefined
  notifications: undefined
  securityAgreement: undefined
  displayCurrency: { fromBalance?: boolean }
  transactionLimits: undefined
  developerOptions: undefined
  BackupOptions: undefined
  BackupStart: undefined
  BackupSeedPhrase: { walletId: string }
  BackupShowSeedPhrase: { walletId: string; seedphrase: string[] }
  BackupVerify: { walletId: string; seedphrase: string[] }
  BackupDoubleCheck: undefined
  BackupComplete: undefined
  ImportWalletOptions: { insideApp?: boolean } | undefined
  ImportWallet: { insideApp?: boolean; onComplete?: () => void }
  QRScannerWallet: { walletId: string }
  RefundTransactionList: undefined
  RefundDestination: {
    invoice: string
    hash: string
    createdAt: Date
    amountMsats: number
  }
  RefundConfirmation: {
    swapAddress: string
    amount: number
    destination: string
    fee: number
    feeType: string
  }
  CashoutDetails: undefined
  CashoutConfirmation: { offer: CashoutOffer }
  CashoutSuccess: undefined
  EditNostrProfile: undefined
  card: undefined
  Card: { reloadlnurl?: string }
  reconciliationReport: { id: string }
  nip17Chat: undefined
  Messages: { event: Event }
  ECashWallet: {
    forceRefresh?: boolean
    refreshTimestamp?: number
  }
  ManageMints: undefined
  ReceiveECash: undefined
  SendECash: undefined
  ConvertECash: { initialAmount?: number }
}

export type ChatStackParamList = {
  chatList: undefined
  chatDetail: { chat: Chat; giftwraps: Event[] }
  sendBitcoinDestination: { username: string }
  transactionDetail: { txid: string }
  messages: { userPrivateKey: string; groupId: string }
}

export type ContactStackParamList = {
  contactList: undefined
  contactDetail: { contact: Contact }
  phoneFlow: undefined
  sendBitcoinDestination: { username: string }
  transactionDetail: { txid: string }
}

export type PhoneValidationStackParamList = {
  Primary: undefined
  phoneLoginInitiate: undefined
  phoneLoginValidate: {
    phone: string
    channel: PhoneCodeChannelType
  }
  authentication: {
    screenPurpose: AuthenticationScreenPurpose
  }
  Home: undefined
  totpLoginValidate: { authToken: string }
  authenticationCheck: undefined
}

export type PrimaryStackParamList = {
  Home: undefined
  Contacts: undefined
  Chat: undefined
  Card: undefined
  Map: undefined
  Earn: undefined
  Scan: undefined
}
