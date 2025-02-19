import { DisplayCurrency, MoneyAmount, WalletOrDisplayCurrency } from "@app/types/amounts"
import { AuthenticationScreenPurpose, PinScreenPurpose } from "../utils/enum"
import {
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
  scanningQRCode: { swapAddress?: string; amount?: number; fee?: number } | undefined
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
    toWallet: Pick<Wallet, "id" | "walletCurrency" | "balance">
    fromWallet: Pick<Wallet, "id" | "walletCurrency" | "balance">
    moneyAmount: MoneyAmount<WalletOrDisplayCurrency>
  }
  conversionSuccess: undefined
  sendBitcoinSuccess: undefined
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
  }
  redeemBitcoinResult: {
    callback: string
    domain: string
    k1: string
    defaultDescription: string
    minWithdrawableSatoshis: MoneyAmount<WalletCurrency>
    maxWithdrawableSatoshis: MoneyAmount<WalletCurrency>
    receivingWalletDescriptor: WalletDescriptor<WalletCurrency>
    unitOfAccountAmount: MoneyAmount<WalletOrDisplayCurrency>
    settlementAmount: MoneyAmount<WalletCurrency>
    displayAmount: MoneyAmount<DisplayCurrency>
    usdAmount: MoneyAmount<WalletCurrency>
    lnurl: string
  }
  phoneFlow: { onComplete?: (token?: string) => void } | undefined
  phoneRegistrationInitiate: { onComplete?: (token?: string) => void } | undefined
  phoneRegistrationValidate: {
    phone: string
    channel: PhoneCodeChannelType
    onComplete?: (token?: string) => void
  }
  transactionDetail: { tx: TransactionFragment }
  breezTransactionDetail: { tx: TransactionFragment }
  TransactionHistoryTabs?: { initialRouteName?: string } | undefined
  USDTransactionHistory: undefined
  transactionHistory?: undefined
  Earn: undefined
  Card: undefined
  Map: undefined
  accountScreen: undefined
  notificationSettingsScreen: undefined
  transactionLimitsScreen: undefined
  emailRegistrationInitiate: undefined
  emailRegistrationValidate: { email: string; emailRegistrationId: string }
  emailLoginInitiate: { onComplete?: (token?: string) => void }
  emailLoginValidate: { email: string; emailLoginId: string }
  totpRegistrationInitiate: undefined
  totpRegistrationValidate: { totpRegistrationId: string }
  totpLoginValidate: { authToken: string }
  BackupOptions: undefined
  BackupStart: undefined
  BackupSeedPhrase: undefined
  BackupDoubleCheck: undefined
  BackupVerify: undefined
  BackupComplete: undefined
  BackupShowSeedPhrase: undefined
  ImportWallet: { insideApp?: boolean; onComplete?: (token?: string) => void }
  ImportWalletOptions: { insideApp?: boolean } | undefined
  RefundTransactionList: undefined
  RefundDestination: { swapAddress: string; amount: number }
  RefundConfirmation: {
    swapAddress: string
    amount: number
    destination: string
    fee: number
    feeType: string
  }
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
  phoneLoginInitiate: { onComplete?: (token?: string) => void }
  phoneLoginValidate: {
    phone: string
    channel: PhoneCodeChannelType
    onComplete?: (token?: string) => void
  }
  authentication: {
    screenPurpose: AuthenticationScreenPurpose
  }
  Home: undefined
  totpLoginValidate: { authToken: string }
}

export type PrimaryStackParamList = {
  Home: undefined
  Contacts: undefined
  Chat: undefined
  Card: undefined
  Map: undefined
  Earn: undefined
}
