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
Object.defineProperty(exports, "__esModule", { value: true });
exports.useHasPromptedSetDefaultAccountQuery = exports.HasPromptedSetDefaultAccountDocument = exports.useFeedbackModalShownLazyQuery = exports.useFeedbackModalShownQuery = exports.FeedbackModalShownDocument = exports.useColorSchemeLazyQuery = exports.useColorSchemeQuery = exports.ColorSchemeDocument = exports.useBetaLazyQuery = exports.useBetaQuery = exports.BetaDocument = exports.useHiddenBalanceToolTipLazyQuery = exports.useHiddenBalanceToolTipQuery = exports.HiddenBalanceToolTipDocument = exports.useHideBalanceLazyQuery = exports.useHideBalanceQuery = exports.HideBalanceDocument = exports.useRealtimePriceLazyQuery = exports.useRealtimePriceQuery = exports.RealtimePriceDocument = exports.useAnalyticsLazyQuery = exports.useAnalyticsQuery = exports.AnalyticsDocument = exports.useMyUserIdLazyQuery = exports.useMyUserIdQuery = exports.MyUserIdDocument = exports.useUserUpdateUsernameMutation = exports.UserUpdateUsernameDocument = exports.useBtcPriceListLazyQuery = exports.useBtcPriceListQuery = exports.BtcPriceListDocument = exports.useMobileUpdateLazyQuery = exports.useMobileUpdateQuery = exports.MobileUpdateDocument = exports.TransactionListFragmentDoc = exports.TransactionFragmentDoc = exports.MyWalletsFragmentDoc = exports.WalletCurrency = exports.TxStatus = exports.TxNotificationType = exports.TxDirection = exports.PriceGraphRange = exports.PhoneCodeChannelType = exports.PayoutSpeed = exports.PaymentSendResult = exports.NotificationChannel = exports.Network = exports.InvoicePaymentStatus = exports.ExchangeCurrencyUnit = exports.AccountLevel = void 0;
exports.useConversionScreenLazyQuery = exports.useConversionScreenQuery = exports.ConversionScreenDocument = exports.useSetDefaultAccountModalLazyQuery = exports.useSetDefaultAccountModalQuery = exports.SetDefaultAccountModalDocument = exports.useBalanceHeaderLazyQuery = exports.useBalanceHeaderQuery = exports.BalanceHeaderDocument = exports.useTransactionListForDefaultAccountLazyQuery = exports.useTransactionListForDefaultAccountQuery = exports.TransactionListForDefaultAccountDocument = exports.useHomeUnauthedLazyQuery = exports.useHomeUnauthedQuery = exports.HomeUnauthedDocument = exports.useHomeAuthedLazyQuery = exports.useHomeAuthedQuery = exports.HomeAuthedDocument = exports.useAuthLazyQuery = exports.useAuthQuery = exports.AuthDocument = exports.useUserUpdateNpubMutation = exports.UserUpdateNpubDocument = exports.useLnUsdInvoiceAmountMutation = exports.LnUsdInvoiceAmountDocument = exports.useAccountDeleteMutation = exports.AccountDeleteDocument = exports.useMerchantMapSuggestMutation = exports.MerchantMapSuggestDocument = exports.useOnChainUsdPaymentSendAsBtcDenominatedMutation = exports.OnChainUsdPaymentSendAsBtcDenominatedDocument = exports.useOnChainUsdPaymentSendMutation = exports.OnChainUsdPaymentSendDocument = exports.useOnChainPaymentSendAllMutation = exports.OnChainPaymentSendAllDocument = exports.useOnChainPaymentSendMutation = exports.OnChainPaymentSendDocument = exports.useLnNoAmountUsdInvoicePaymentSendMutation = exports.LnNoAmountUsdInvoicePaymentSendDocument = exports.useLnInvoicePaymentSendMutation = exports.LnInvoicePaymentSendDocument = exports.useLnNoAmountInvoicePaymentSendMutation = exports.LnNoAmountInvoicePaymentSendDocument = exports.useIntraLedgerUsdPaymentSendMutation = exports.IntraLedgerUsdPaymentSendDocument = exports.useIntraLedgerPaymentSendMutation = exports.IntraLedgerPaymentSendDocument = exports.useUserLogoutMutation = exports.UserLogoutDocument = exports.useHasPromptedSetDefaultAccountLazyQuery = void 0;
exports.useDisplayCurrencyLazyQuery = exports.useDisplayCurrencyQuery = exports.DisplayCurrencyDocument = exports.useLevelLazyQuery = exports.useLevelQuery = exports.LevelDocument = exports.useNetworkLazyQuery = exports.useNetworkQuery = exports.NetworkDocument = exports.useTransactionDetailsLazyQuery = exports.useTransactionDetailsQuery = exports.TransactionDetailsDocument = exports.useRealtimePriceWsSubscription = exports.RealtimePriceWsDocument = exports.useNpubByUsernameLazyQuery = exports.useNpubByUsernameQuery = exports.NpubByUsernameDocument = exports.useRealtimePriceUnauthedLazyQuery = exports.useRealtimePriceUnauthedQuery = exports.RealtimePriceUnauthedDocument = exports.useScanningQrCodeScreenLazyQuery = exports.useScanningQrCodeScreenQuery = exports.ScanningQrCodeScreenDocument = exports.useSendBitcoinConfirmationScreenLazyQuery = exports.useSendBitcoinConfirmationScreenQuery = exports.SendBitcoinConfirmationScreenDocument = exports.useSendBitcoinInternalLimitsLazyQuery = exports.useSendBitcoinInternalLimitsQuery = exports.SendBitcoinInternalLimitsDocument = exports.useSendBitcoinWithdrawalLimitsLazyQuery = exports.useSendBitcoinWithdrawalLimitsQuery = exports.SendBitcoinWithdrawalLimitsDocument = exports.useSendBitcoinDetailsScreenLazyQuery = exports.useSendBitcoinDetailsScreenQuery = exports.SendBitcoinDetailsScreenDocument = exports.useAccountDefaultWalletLazyQuery = exports.useAccountDefaultWalletQuery = exports.AccountDefaultWalletDocument = exports.useSendBitcoinDestinationLazyQuery = exports.useSendBitcoinDestinationQuery = exports.SendBitcoinDestinationDocument = exports.useWalletOverviewScreenLazyQuery = exports.useWalletOverviewScreenQuery = exports.WalletOverviewScreenDocument = exports.useWalletCsvTransactionsLazyQuery = exports.useWalletCsvTransactionsQuery = exports.WalletCsvTransactionsDocument = exports.useCashoutScreenLazyQuery = exports.useCashoutScreenQuery = exports.CashoutScreenDocument = void 0;
exports.useUserLoginMutation = exports.UserLoginDocument = exports.useBusinessMapMarkersLazyQuery = exports.useBusinessMapMarkersQuery = exports.BusinessMapMarkersDocument = exports.useAddressScreenLazyQuery = exports.useAddressScreenQuery = exports.AddressScreenDocument = exports.useUserEmailRegistrationValidateMutation = exports.UserEmailRegistrationValidateDocument = exports.useUserEmailRegistrationInitiateMutation = exports.UserEmailRegistrationInitiateDocument = exports.useQuizCompletedMutation = exports.QuizCompletedDocument = exports.useMyQuizQuestionsLazyQuery = exports.useMyQuizQuestionsQuery = exports.MyQuizQuestionsDocument = exports.useQuizSatsLazyQuery = exports.useQuizSatsQuery = exports.QuizSatsDocument = exports.useContactsLazyQuery = exports.useContactsQuery = exports.ContactsDocument = exports.useUserContactUpdateAliasMutation = exports.UserContactUpdateAliasDocument = exports.useTransactionListForContactLazyQuery = exports.useTransactionListForContactQuery = exports.TransactionListForContactDocument = exports.useOnChainUsdTxFeeAsBtcDenominatedLazyQuery = exports.useOnChainUsdTxFeeAsBtcDenominatedQuery = exports.OnChainUsdTxFeeAsBtcDenominatedDocument = exports.useOnChainUsdTxFeeLazyQuery = exports.useOnChainUsdTxFeeQuery = exports.OnChainUsdTxFeeDocument = exports.useOnChainTxFeeLazyQuery = exports.useOnChainTxFeeQuery = exports.OnChainTxFeeDocument = exports.useLnNoAmountUsdInvoiceFeeProbeMutation = exports.LnNoAmountUsdInvoiceFeeProbeDocument = exports.useLnUsdInvoiceFeeProbeMutation = exports.LnUsdInvoiceFeeProbeDocument = exports.useLnInvoiceFeeProbeMutation = exports.LnInvoiceFeeProbeDocument = exports.useLnNoAmountInvoiceFeeProbeMutation = exports.LnNoAmountInvoiceFeeProbeDocument = exports.useCaptchaCreateChallengeMutation = exports.CaptchaCreateChallengeDocument = exports.useCurrencyListLazyQuery = exports.useCurrencyListQuery = exports.CurrencyListDocument = void 0;
exports.useUserUpdateLanguageMutation = exports.UserUpdateLanguageDocument = exports.useLanguageLazyQuery = exports.useLanguageQuery = exports.LanguageDocument = exports.useAccountUpdateDisplayCurrencyMutation = exports.AccountUpdateDisplayCurrencyDocument = exports.useSetDefaultWalletScreenLazyQuery = exports.useSetDefaultWalletScreenQuery = exports.SetDefaultWalletScreenDocument = exports.useAccountUpdateDefaultWalletIdMutation = exports.AccountUpdateDefaultWalletIdDocument = exports.useWarningSecureAccountLazyQuery = exports.useWarningSecureAccountQuery = exports.WarningSecureAccountDocument = exports.useUserTotpDeleteMutation = exports.UserTotpDeleteDocument = exports.useUserPhoneDeleteMutation = exports.UserPhoneDeleteDocument = exports.useUserEmailDeleteMutation = exports.UserEmailDeleteDocument = exports.useAccountScreenLazyQuery = exports.useAccountScreenQuery = exports.AccountScreenDocument = exports.useFeedbackSubmitMutation = exports.FeedbackSubmitDocument = exports.useLnUsdInvoiceCreateMutation = exports.LnUsdInvoiceCreateDocument = exports.useOnChainAddressCurrentMutation = exports.OnChainAddressCurrentDocument = exports.useLnInvoiceCreateMutation = exports.LnInvoiceCreateDocument = exports.useLnNoAmountInvoiceCreateMutation = exports.LnNoAmountInvoiceCreateDocument = exports.usePaymentRequestLazyQuery = exports.usePaymentRequestQuery = exports.PaymentRequestDocument = exports.useMyLnUpdatesSubscription = exports.MyLnUpdatesDocument = exports.useUserPhoneRegistrationInitiateMutation = exports.UserPhoneRegistrationInitiateDocument = exports.useSupportedCountriesLazyQuery = exports.useSupportedCountriesQuery = exports.SupportedCountriesDocument = exports.useCaptchaRequestAuthCodeMutation = exports.CaptchaRequestAuthCodeDocument = exports.useUserPhoneRegistrationValidateMutation = exports.UserPhoneRegistrationValidateDocument = exports.useUserLoginUpgradeMutation = exports.UserLoginUpgradeDocument = void 0;
exports.useWalletsLazyQuery = exports.useWalletsQuery = exports.WalletsDocument = exports.useDeviceNotificationTokenCreateMutation = exports.DeviceNotificationTokenCreateDocument = exports.useUserTotpRegistrationValidateMutation = exports.UserTotpRegistrationValidateDocument = exports.useUserTotpRegistrationInitiateMutation = exports.UserTotpRegistrationInitiateDocument = exports.useTotpRegistrationScreenLazyQuery = exports.useTotpRegistrationScreenQuery = exports.TotpRegistrationScreenDocument = exports.useAccountLimitsLazyQuery = exports.useAccountLimitsQuery = exports.AccountLimitsDocument = exports.useUserTotpDeleteAMutation = exports.UserTotpDeleteADocument = exports.useExportCsvSettingLazyQuery = exports.useExportCsvSettingQuery = exports.ExportCsvSettingDocument = exports.useSettingsScreenLazyQuery = exports.useSettingsScreenQuery = exports.SettingsScreenDocument = exports.useAccountDisableNotificationCategoryMutation = exports.AccountDisableNotificationCategoryDocument = exports.useAccountEnableNotificationCategoryMutation = exports.AccountEnableNotificationCategoryDocument = exports.useAccountDisableNotificationChannelMutation = exports.AccountDisableNotificationChannelDocument = exports.useAccountEnableNotificationChannelMutation = exports.AccountEnableNotificationChannelDocument = exports.useNotificationSettingsLazyQuery = exports.useNotificationSettingsQuery = exports.NotificationSettingsDocument = void 0;
// this file is autogenerated by codegen
/* eslint-disable */
const client_1 = require("@apollo/client");
const Apollo = __importStar(require("@apollo/client"));
const defaultOptions = {};
exports.AccountLevel = {
    One: 'ONE',
    Three: 'THREE',
    Two: 'TWO',
    Zero: 'ZERO'
};
exports.ExchangeCurrencyUnit = {
    Btcsat: 'BTCSAT',
    Usdcent: 'USDCENT'
};
exports.InvoicePaymentStatus = {
    Expired: 'EXPIRED',
    Paid: 'PAID',
    Pending: 'PENDING'
};
exports.Network = {
    Mainnet: 'mainnet',
    Regtest: 'regtest',
    Signet: 'signet',
    Testnet: 'testnet'
};
exports.NotificationChannel = {
    Push: 'PUSH'
};
exports.PaymentSendResult = {
    AlreadyPaid: 'ALREADY_PAID',
    Failure: 'FAILURE',
    Pending: 'PENDING',
    Success: 'SUCCESS'
};
exports.PayoutSpeed = {
    Fast: 'FAST'
};
exports.PhoneCodeChannelType = {
    Sms: 'SMS',
    Whatsapp: 'WHATSAPP'
};
/** The range for the X axis in the BTC price graph */
exports.PriceGraphRange = {
    FiveYears: 'FIVE_YEARS',
    OneDay: 'ONE_DAY',
    OneMonth: 'ONE_MONTH',
    OneWeek: 'ONE_WEEK',
    OneYear: 'ONE_YEAR'
};
exports.TxDirection = {
    Receive: 'RECEIVE',
    Send: 'SEND'
};
exports.TxNotificationType = {
    IntraLedgerPayment: 'IntraLedgerPayment',
    IntraLedgerReceipt: 'IntraLedgerReceipt',
    LnInvoicePaid: 'LnInvoicePaid',
    OnchainPayment: 'OnchainPayment',
    OnchainReceipt: 'OnchainReceipt',
    OnchainReceiptPending: 'OnchainReceiptPending'
};
exports.TxStatus = {
    Failure: 'FAILURE',
    Pending: 'PENDING',
    Success: 'SUCCESS'
};
exports.WalletCurrency = {
    Btc: 'BTC',
    Usd: 'USD'
};
exports.MyWalletsFragmentDoc = (0, client_1.gql) `
    fragment MyWallets on ConsumerAccount {
  wallets {
    id
    balance
    walletCurrency
  }
}
    `;
exports.TransactionFragmentDoc = (0, client_1.gql) `
    fragment Transaction on Transaction {
  __typename
  id
  status
  direction
  memo
  createdAt
  settlementAmount
  settlementFee
  settlementDisplayFee
  settlementCurrency
  settlementDisplayAmount
  settlementDisplayCurrency
  settlementPrice {
    base
    offset
    currencyUnit
    formattedAmount
  }
  initiationVia {
    ... on InitiationViaIntraLedger {
      counterPartyWalletId
      counterPartyUsername
    }
    ... on InitiationViaLn {
      paymentHash
    }
    ... on InitiationViaOnChain {
      address
    }
  }
  settlementVia {
    ... on SettlementViaIntraLedger {
      counterPartyWalletId
      counterPartyUsername
    }
    ... on SettlementViaLn {
      paymentSecret
    }
    ... on SettlementViaOnChain {
      transactionHash
    }
  }
}
    `;
exports.TransactionListFragmentDoc = (0, client_1.gql) `
    fragment TransactionList on TransactionConnection {
  pageInfo {
    hasNextPage
    hasPreviousPage
    startCursor
    endCursor
  }
  edges {
    cursor
    node {
      ...Transaction
    }
  }
}
    ${exports.TransactionFragmentDoc}`;
exports.MobileUpdateDocument = (0, client_1.gql) `
    query mobileUpdate {
  mobileVersions {
    platform
    currentSupported
    minSupported
  }
}
    `;
/**
 * __useMobileUpdateQuery__
 *
 * To run a query within a React component, call `useMobileUpdateQuery` and pass it any options that fit your needs.
 * When your component renders, `useMobileUpdateQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useMobileUpdateQuery({
 *   variables: {
 *   },
 * });
 */
function useMobileUpdateQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.MobileUpdateDocument, options);
}
exports.useMobileUpdateQuery = useMobileUpdateQuery;
function useMobileUpdateLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.MobileUpdateDocument, options);
}
exports.useMobileUpdateLazyQuery = useMobileUpdateLazyQuery;
exports.BtcPriceListDocument = (0, client_1.gql) `
    query btcPriceList($range: PriceGraphRange!) {
  btcPriceList(range: $range) {
    timestamp
    price {
      base
      offset
      currencyUnit
    }
  }
}
    `;
/**
 * __useBtcPriceListQuery__
 *
 * To run a query within a React component, call `useBtcPriceListQuery` and pass it any options that fit your needs.
 * When your component renders, `useBtcPriceListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useBtcPriceListQuery({
 *   variables: {
 *      range: // value for 'range'
 *   },
 * });
 */
function useBtcPriceListQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.BtcPriceListDocument, options);
}
exports.useBtcPriceListQuery = useBtcPriceListQuery;
function useBtcPriceListLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.BtcPriceListDocument, options);
}
exports.useBtcPriceListLazyQuery = useBtcPriceListLazyQuery;
exports.UserUpdateUsernameDocument = (0, client_1.gql) `
    mutation userUpdateUsername($input: UserUpdateUsernameInput!) {
  userUpdateUsername(input: $input) {
    errors {
      code
    }
    user {
      id
      username
    }
  }
}
    `;
/**
 * __useUserUpdateUsernameMutation__
 *
 * To run a mutation, you first call `useUserUpdateUsernameMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserUpdateUsernameMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userUpdateUsernameMutation, { data, loading, error }] = useUserUpdateUsernameMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserUpdateUsernameMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserUpdateUsernameDocument, options);
}
exports.useUserUpdateUsernameMutation = useUserUpdateUsernameMutation;
exports.MyUserIdDocument = (0, client_1.gql) `
    query myUserId {
  me {
    id
  }
}
    `;
/**
 * __useMyUserIdQuery__
 *
 * To run a query within a React component, call `useMyUserIdQuery` and pass it any options that fit your needs.
 * When your component renders, `useMyUserIdQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useMyUserIdQuery({
 *   variables: {
 *   },
 * });
 */
function useMyUserIdQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.MyUserIdDocument, options);
}
exports.useMyUserIdQuery = useMyUserIdQuery;
function useMyUserIdLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.MyUserIdDocument, options);
}
exports.useMyUserIdLazyQuery = useMyUserIdLazyQuery;
exports.AnalyticsDocument = (0, client_1.gql) `
    query analytics {
  me {
    username
    id
  }
  globals {
    network
  }
}
    `;
/**
 * __useAnalyticsQuery__
 *
 * To run a query within a React component, call `useAnalyticsQuery` and pass it any options that fit your needs.
 * When your component renders, `useAnalyticsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAnalyticsQuery({
 *   variables: {
 *   },
 * });
 */
function useAnalyticsQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.AnalyticsDocument, options);
}
exports.useAnalyticsQuery = useAnalyticsQuery;
function useAnalyticsLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.AnalyticsDocument, options);
}
exports.useAnalyticsLazyQuery = useAnalyticsLazyQuery;
exports.RealtimePriceDocument = (0, client_1.gql) `
    query realtimePrice {
  me {
    id
    defaultAccount {
      id
      realtimePrice {
        btcSatPrice {
          base
          offset
        }
        denominatorCurrency
        id
        timestamp
        usdCentPrice {
          base
          offset
        }
      }
    }
  }
}
    `;
/**
 * __useRealtimePriceQuery__
 *
 * To run a query within a React component, call `useRealtimePriceQuery` and pass it any options that fit your needs.
 * When your component renders, `useRealtimePriceQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useRealtimePriceQuery({
 *   variables: {
 *   },
 * });
 */
function useRealtimePriceQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.RealtimePriceDocument, options);
}
exports.useRealtimePriceQuery = useRealtimePriceQuery;
function useRealtimePriceLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.RealtimePriceDocument, options);
}
exports.useRealtimePriceLazyQuery = useRealtimePriceLazyQuery;
exports.HideBalanceDocument = (0, client_1.gql) `
    query hideBalance {
  hideBalance @client
}
    `;
/**
 * __useHideBalanceQuery__
 *
 * To run a query within a React component, call `useHideBalanceQuery` and pass it any options that fit your needs.
 * When your component renders, `useHideBalanceQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useHideBalanceQuery({
 *   variables: {
 *   },
 * });
 */
function useHideBalanceQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.HideBalanceDocument, options);
}
exports.useHideBalanceQuery = useHideBalanceQuery;
function useHideBalanceLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.HideBalanceDocument, options);
}
exports.useHideBalanceLazyQuery = useHideBalanceLazyQuery;
exports.HiddenBalanceToolTipDocument = (0, client_1.gql) `
    query hiddenBalanceToolTip {
  hiddenBalanceToolTip @client
}
    `;
/**
 * __useHiddenBalanceToolTipQuery__
 *
 * To run a query within a React component, call `useHiddenBalanceToolTipQuery` and pass it any options that fit your needs.
 * When your component renders, `useHiddenBalanceToolTipQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useHiddenBalanceToolTipQuery({
 *   variables: {
 *   },
 * });
 */
function useHiddenBalanceToolTipQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.HiddenBalanceToolTipDocument, options);
}
exports.useHiddenBalanceToolTipQuery = useHiddenBalanceToolTipQuery;
function useHiddenBalanceToolTipLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.HiddenBalanceToolTipDocument, options);
}
exports.useHiddenBalanceToolTipLazyQuery = useHiddenBalanceToolTipLazyQuery;
exports.BetaDocument = (0, client_1.gql) `
    query beta {
  beta @client
}
    `;
/**
 * __useBetaQuery__
 *
 * To run a query within a React component, call `useBetaQuery` and pass it any options that fit your needs.
 * When your component renders, `useBetaQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useBetaQuery({
 *   variables: {
 *   },
 * });
 */
function useBetaQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.BetaDocument, options);
}
exports.useBetaQuery = useBetaQuery;
function useBetaLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.BetaDocument, options);
}
exports.useBetaLazyQuery = useBetaLazyQuery;
exports.ColorSchemeDocument = (0, client_1.gql) `
    query colorScheme {
  colorScheme @client
}
    `;
/**
 * __useColorSchemeQuery__
 *
 * To run a query within a React component, call `useColorSchemeQuery` and pass it any options that fit your needs.
 * When your component renders, `useColorSchemeQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useColorSchemeQuery({
 *   variables: {
 *   },
 * });
 */
function useColorSchemeQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.ColorSchemeDocument, options);
}
exports.useColorSchemeQuery = useColorSchemeQuery;
function useColorSchemeLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.ColorSchemeDocument, options);
}
exports.useColorSchemeLazyQuery = useColorSchemeLazyQuery;
exports.FeedbackModalShownDocument = (0, client_1.gql) `
    query feedbackModalShown {
  feedbackModalShown @client
}
    `;
/**
 * __useFeedbackModalShownQuery__
 *
 * To run a query within a React component, call `useFeedbackModalShownQuery` and pass it any options that fit your needs.
 * When your component renders, `useFeedbackModalShownQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useFeedbackModalShownQuery({
 *   variables: {
 *   },
 * });
 */
function useFeedbackModalShownQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.FeedbackModalShownDocument, options);
}
exports.useFeedbackModalShownQuery = useFeedbackModalShownQuery;
function useFeedbackModalShownLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.FeedbackModalShownDocument, options);
}
exports.useFeedbackModalShownLazyQuery = useFeedbackModalShownLazyQuery;
exports.HasPromptedSetDefaultAccountDocument = (0, client_1.gql) `
    query hasPromptedSetDefaultAccount {
  hasPromptedSetDefaultAccount @client
}
    `;
/**
 * __useHasPromptedSetDefaultAccountQuery__
 *
 * To run a query within a React component, call `useHasPromptedSetDefaultAccountQuery` and pass it any options that fit your needs.
 * When your component renders, `useHasPromptedSetDefaultAccountQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useHasPromptedSetDefaultAccountQuery({
 *   variables: {
 *   },
 * });
 */
function useHasPromptedSetDefaultAccountQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.HasPromptedSetDefaultAccountDocument, options);
}
exports.useHasPromptedSetDefaultAccountQuery = useHasPromptedSetDefaultAccountQuery;
function useHasPromptedSetDefaultAccountLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.HasPromptedSetDefaultAccountDocument, options);
}
exports.useHasPromptedSetDefaultAccountLazyQuery = useHasPromptedSetDefaultAccountLazyQuery;
exports.UserLogoutDocument = (0, client_1.gql) `
    mutation userLogout($input: UserLogoutInput!) {
  userLogout(input: $input) {
    success
    errors {
      code
      message
      __typename
    }
    __typename
  }
}
    `;
/**
 * __useUserLogoutMutation__
 *
 * To run a mutation, you first call `useUserLogoutMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserLogoutMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userLogoutMutation, { data, loading, error }] = useUserLogoutMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserLogoutMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserLogoutDocument, options);
}
exports.useUserLogoutMutation = useUserLogoutMutation;
exports.IntraLedgerPaymentSendDocument = (0, client_1.gql) `
    mutation intraLedgerPaymentSend($input: IntraLedgerPaymentSendInput!) {
  intraLedgerPaymentSend(input: $input) {
    errors {
      message
    }
    status
  }
}
    `;
/**
 * __useIntraLedgerPaymentSendMutation__
 *
 * To run a mutation, you first call `useIntraLedgerPaymentSendMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useIntraLedgerPaymentSendMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [intraLedgerPaymentSendMutation, { data, loading, error }] = useIntraLedgerPaymentSendMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useIntraLedgerPaymentSendMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.IntraLedgerPaymentSendDocument, options);
}
exports.useIntraLedgerPaymentSendMutation = useIntraLedgerPaymentSendMutation;
exports.IntraLedgerUsdPaymentSendDocument = (0, client_1.gql) `
    mutation intraLedgerUsdPaymentSend($input: IntraLedgerUsdPaymentSendInput!) {
  intraLedgerUsdPaymentSend(input: $input) {
    errors {
      message
    }
    status
  }
}
    `;
/**
 * __useIntraLedgerUsdPaymentSendMutation__
 *
 * To run a mutation, you first call `useIntraLedgerUsdPaymentSendMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useIntraLedgerUsdPaymentSendMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [intraLedgerUsdPaymentSendMutation, { data, loading, error }] = useIntraLedgerUsdPaymentSendMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useIntraLedgerUsdPaymentSendMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.IntraLedgerUsdPaymentSendDocument, options);
}
exports.useIntraLedgerUsdPaymentSendMutation = useIntraLedgerUsdPaymentSendMutation;
exports.LnNoAmountInvoicePaymentSendDocument = (0, client_1.gql) `
    mutation lnNoAmountInvoicePaymentSend($input: LnNoAmountInvoicePaymentInput!) {
  lnNoAmountInvoicePaymentSend(input: $input) {
    errors {
      message
    }
    status
  }
}
    `;
/**
 * __useLnNoAmountInvoicePaymentSendMutation__
 *
 * To run a mutation, you first call `useLnNoAmountInvoicePaymentSendMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLnNoAmountInvoicePaymentSendMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [lnNoAmountInvoicePaymentSendMutation, { data, loading, error }] = useLnNoAmountInvoicePaymentSendMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useLnNoAmountInvoicePaymentSendMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.LnNoAmountInvoicePaymentSendDocument, options);
}
exports.useLnNoAmountInvoicePaymentSendMutation = useLnNoAmountInvoicePaymentSendMutation;
exports.LnInvoicePaymentSendDocument = (0, client_1.gql) `
    mutation lnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
  lnInvoicePaymentSend(input: $input) {
    errors {
      message
    }
    status
  }
}
    `;
/**
 * __useLnInvoicePaymentSendMutation__
 *
 * To run a mutation, you first call `useLnInvoicePaymentSendMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLnInvoicePaymentSendMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [lnInvoicePaymentSendMutation, { data, loading, error }] = useLnInvoicePaymentSendMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useLnInvoicePaymentSendMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.LnInvoicePaymentSendDocument, options);
}
exports.useLnInvoicePaymentSendMutation = useLnInvoicePaymentSendMutation;
exports.LnNoAmountUsdInvoicePaymentSendDocument = (0, client_1.gql) `
    mutation lnNoAmountUsdInvoicePaymentSend($input: LnNoAmountUsdInvoicePaymentInput!) {
  lnNoAmountUsdInvoicePaymentSend(input: $input) {
    errors {
      message
    }
    status
  }
}
    `;
/**
 * __useLnNoAmountUsdInvoicePaymentSendMutation__
 *
 * To run a mutation, you first call `useLnNoAmountUsdInvoicePaymentSendMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLnNoAmountUsdInvoicePaymentSendMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [lnNoAmountUsdInvoicePaymentSendMutation, { data, loading, error }] = useLnNoAmountUsdInvoicePaymentSendMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useLnNoAmountUsdInvoicePaymentSendMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.LnNoAmountUsdInvoicePaymentSendDocument, options);
}
exports.useLnNoAmountUsdInvoicePaymentSendMutation = useLnNoAmountUsdInvoicePaymentSendMutation;
exports.OnChainPaymentSendDocument = (0, client_1.gql) `
    mutation onChainPaymentSend($input: OnChainPaymentSendInput!) {
  onChainPaymentSend(input: $input) {
    errors {
      message
    }
    status
  }
}
    `;
/**
 * __useOnChainPaymentSendMutation__
 *
 * To run a mutation, you first call `useOnChainPaymentSendMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useOnChainPaymentSendMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [onChainPaymentSendMutation, { data, loading, error }] = useOnChainPaymentSendMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useOnChainPaymentSendMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.OnChainPaymentSendDocument, options);
}
exports.useOnChainPaymentSendMutation = useOnChainPaymentSendMutation;
exports.OnChainPaymentSendAllDocument = (0, client_1.gql) `
    mutation onChainPaymentSendAll($input: OnChainPaymentSendAllInput!) {
  onChainPaymentSendAll(input: $input) {
    errors {
      message
    }
    status
  }
}
    `;
/**
 * __useOnChainPaymentSendAllMutation__
 *
 * To run a mutation, you first call `useOnChainPaymentSendAllMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useOnChainPaymentSendAllMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [onChainPaymentSendAllMutation, { data, loading, error }] = useOnChainPaymentSendAllMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useOnChainPaymentSendAllMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.OnChainPaymentSendAllDocument, options);
}
exports.useOnChainPaymentSendAllMutation = useOnChainPaymentSendAllMutation;
exports.OnChainUsdPaymentSendDocument = (0, client_1.gql) `
    mutation onChainUsdPaymentSend($input: OnChainUsdPaymentSendInput!) {
  onChainUsdPaymentSend(input: $input) {
    errors {
      message
    }
    status
  }
}
    `;
/**
 * __useOnChainUsdPaymentSendMutation__
 *
 * To run a mutation, you first call `useOnChainUsdPaymentSendMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useOnChainUsdPaymentSendMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [onChainUsdPaymentSendMutation, { data, loading, error }] = useOnChainUsdPaymentSendMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useOnChainUsdPaymentSendMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.OnChainUsdPaymentSendDocument, options);
}
exports.useOnChainUsdPaymentSendMutation = useOnChainUsdPaymentSendMutation;
exports.OnChainUsdPaymentSendAsBtcDenominatedDocument = (0, client_1.gql) `
    mutation onChainUsdPaymentSendAsBtcDenominated($input: OnChainUsdPaymentSendAsBtcDenominatedInput!) {
  onChainUsdPaymentSendAsBtcDenominated(input: $input) {
    errors {
      message
    }
    status
  }
}
    `;
/**
 * __useOnChainUsdPaymentSendAsBtcDenominatedMutation__
 *
 * To run a mutation, you first call `useOnChainUsdPaymentSendAsBtcDenominatedMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useOnChainUsdPaymentSendAsBtcDenominatedMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [onChainUsdPaymentSendAsBtcDenominatedMutation, { data, loading, error }] = useOnChainUsdPaymentSendAsBtcDenominatedMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useOnChainUsdPaymentSendAsBtcDenominatedMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.OnChainUsdPaymentSendAsBtcDenominatedDocument, options);
}
exports.useOnChainUsdPaymentSendAsBtcDenominatedMutation = useOnChainUsdPaymentSendAsBtcDenominatedMutation;
exports.MerchantMapSuggestDocument = (0, client_1.gql) `
    mutation MerchantMapSuggest($input: MerchantMapSuggestInput!) {
  merchantMapSuggest(input: $input) {
    errors {
      code
      message
      path
    }
    merchant {
      coordinates {
        latitude
        longitude
      }
      createdAt
      id
      title
      username
      validated
    }
  }
}
    `;
/**
 * __useMerchantMapSuggestMutation__
 *
 * To run a mutation, you first call `useMerchantMapSuggestMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMerchantMapSuggestMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [merchantMapSuggestMutation, { data, loading, error }] = useMerchantMapSuggestMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useMerchantMapSuggestMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.MerchantMapSuggestDocument, options);
}
exports.useMerchantMapSuggestMutation = useMerchantMapSuggestMutation;
exports.AccountDeleteDocument = (0, client_1.gql) `
    mutation accountDelete {
  accountDelete {
    errors {
      message
    }
    success
  }
}
    `;
/**
 * __useAccountDeleteMutation__
 *
 * To run a mutation, you first call `useAccountDeleteMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAccountDeleteMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [accountDeleteMutation, { data, loading, error }] = useAccountDeleteMutation({
 *   variables: {
 *   },
 * });
 */
function useAccountDeleteMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.AccountDeleteDocument, options);
}
exports.useAccountDeleteMutation = useAccountDeleteMutation;
exports.LnUsdInvoiceAmountDocument = (0, client_1.gql) `
    mutation lnUsdInvoiceAmount($input: LnUsdInvoiceFeeProbeInput!) {
  lnUsdInvoiceFeeProbe(input: $input) {
    errors {
      message
    }
    invoiceAmount
    amount
  }
}
    `;
/**
 * __useLnUsdInvoiceAmountMutation__
 *
 * To run a mutation, you first call `useLnUsdInvoiceAmountMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLnUsdInvoiceAmountMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [lnUsdInvoiceAmountMutation, { data, loading, error }] = useLnUsdInvoiceAmountMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useLnUsdInvoiceAmountMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.LnUsdInvoiceAmountDocument, options);
}
exports.useLnUsdInvoiceAmountMutation = useLnUsdInvoiceAmountMutation;
exports.UserUpdateNpubDocument = (0, client_1.gql) `
    mutation userUpdateNpub($input: UserUpdateNpubInput!) {
  userUpdateNpub(input: $input) {
    errors {
      code
    }
    user {
      id
      npub
    }
  }
}
    `;
/**
 * __useUserUpdateNpubMutation__
 *
 * To run a mutation, you first call `useUserUpdateNpubMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserUpdateNpubMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userUpdateNpubMutation, { data, loading, error }] = useUserUpdateNpubMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserUpdateNpubMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserUpdateNpubDocument, options);
}
exports.useUserUpdateNpubMutation = useUserUpdateNpubMutation;
exports.AuthDocument = (0, client_1.gql) `
    query auth {
  me {
    id
    language
    username
    phone
    email {
      address
      verified
    }
  }
}
    `;
/**
 * __useAuthQuery__
 *
 * To run a query within a React component, call `useAuthQuery` and pass it any options that fit your needs.
 * When your component renders, `useAuthQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAuthQuery({
 *   variables: {
 *   },
 * });
 */
function useAuthQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.AuthDocument, options);
}
exports.useAuthQuery = useAuthQuery;
function useAuthLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.AuthDocument, options);
}
exports.useAuthLazyQuery = useAuthLazyQuery;
exports.HomeAuthedDocument = (0, client_1.gql) `
    query homeAuthed {
  me {
    id
    language
    username
    phone
    email {
      address
      verified
    }
    npub
    defaultAccount {
      id
      level
      defaultWalletId
      transactions(first: 3) {
        ...TransactionList
      }
      wallets {
        id
        balance
        walletCurrency
      }
    }
  }
}
    ${exports.TransactionListFragmentDoc}`;
/**
 * __useHomeAuthedQuery__
 *
 * To run a query within a React component, call `useHomeAuthedQuery` and pass it any options that fit your needs.
 * When your component renders, `useHomeAuthedQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useHomeAuthedQuery({
 *   variables: {
 *   },
 * });
 */
function useHomeAuthedQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.HomeAuthedDocument, options);
}
exports.useHomeAuthedQuery = useHomeAuthedQuery;
function useHomeAuthedLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.HomeAuthedDocument, options);
}
exports.useHomeAuthedLazyQuery = useHomeAuthedLazyQuery;
exports.HomeUnauthedDocument = (0, client_1.gql) `
    query homeUnauthed {
  globals {
    network
  }
  currencyList {
    id
    flag
    name
    symbol
    fractionDigits
  }
}
    `;
/**
 * __useHomeUnauthedQuery__
 *
 * To run a query within a React component, call `useHomeUnauthedQuery` and pass it any options that fit your needs.
 * When your component renders, `useHomeUnauthedQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useHomeUnauthedQuery({
 *   variables: {
 *   },
 * });
 */
function useHomeUnauthedQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.HomeUnauthedDocument, options);
}
exports.useHomeUnauthedQuery = useHomeUnauthedQuery;
function useHomeUnauthedLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.HomeUnauthedDocument, options);
}
exports.useHomeUnauthedLazyQuery = useHomeUnauthedLazyQuery;
exports.TransactionListForDefaultAccountDocument = (0, client_1.gql) `
    query transactionListForDefaultAccount($first: Int, $after: String, $last: Int, $before: String) {
  me {
    id
    defaultAccount {
      id
      transactions(first: $first, after: $after, last: $last, before: $before) {
        ...TransactionList
      }
    }
  }
}
    ${exports.TransactionListFragmentDoc}`;
/**
 * __useTransactionListForDefaultAccountQuery__
 *
 * To run a query within a React component, call `useTransactionListForDefaultAccountQuery` and pass it any options that fit your needs.
 * When your component renders, `useTransactionListForDefaultAccountQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useTransactionListForDefaultAccountQuery({
 *   variables: {
 *      first: // value for 'first'
 *      after: // value for 'after'
 *      last: // value for 'last'
 *      before: // value for 'before'
 *   },
 * });
 */
function useTransactionListForDefaultAccountQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.TransactionListForDefaultAccountDocument, options);
}
exports.useTransactionListForDefaultAccountQuery = useTransactionListForDefaultAccountQuery;
function useTransactionListForDefaultAccountLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.TransactionListForDefaultAccountDocument, options);
}
exports.useTransactionListForDefaultAccountLazyQuery = useTransactionListForDefaultAccountLazyQuery;
exports.BalanceHeaderDocument = (0, client_1.gql) `
    query balanceHeader {
  me {
    id
    defaultAccount {
      id
      wallets {
        id
        balance
        walletCurrency
      }
    }
  }
}
    `;
/**
 * __useBalanceHeaderQuery__
 *
 * To run a query within a React component, call `useBalanceHeaderQuery` and pass it any options that fit your needs.
 * When your component renders, `useBalanceHeaderQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useBalanceHeaderQuery({
 *   variables: {
 *   },
 * });
 */
function useBalanceHeaderQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.BalanceHeaderDocument, options);
}
exports.useBalanceHeaderQuery = useBalanceHeaderQuery;
function useBalanceHeaderLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.BalanceHeaderDocument, options);
}
exports.useBalanceHeaderLazyQuery = useBalanceHeaderLazyQuery;
exports.SetDefaultAccountModalDocument = (0, client_1.gql) `
    query setDefaultAccountModal {
  me {
    id
    defaultAccount {
      id
      defaultWalletId
      wallets {
        id
        balance
        walletCurrency
      }
    }
  }
}
    `;
/**
 * __useSetDefaultAccountModalQuery__
 *
 * To run a query within a React component, call `useSetDefaultAccountModalQuery` and pass it any options that fit your needs.
 * When your component renders, `useSetDefaultAccountModalQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSetDefaultAccountModalQuery({
 *   variables: {
 *   },
 * });
 */
function useSetDefaultAccountModalQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.SetDefaultAccountModalDocument, options);
}
exports.useSetDefaultAccountModalQuery = useSetDefaultAccountModalQuery;
function useSetDefaultAccountModalLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.SetDefaultAccountModalDocument, options);
}
exports.useSetDefaultAccountModalLazyQuery = useSetDefaultAccountModalLazyQuery;
exports.ConversionScreenDocument = (0, client_1.gql) `
    query conversionScreen {
  me {
    id
    defaultAccount {
      id
      wallets {
        id
        balance
        walletCurrency
      }
    }
  }
}
    `;
/**
 * __useConversionScreenQuery__
 *
 * To run a query within a React component, call `useConversionScreenQuery` and pass it any options that fit your needs.
 * When your component renders, `useConversionScreenQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useConversionScreenQuery({
 *   variables: {
 *   },
 * });
 */
function useConversionScreenQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.ConversionScreenDocument, options);
}
exports.useConversionScreenQuery = useConversionScreenQuery;
function useConversionScreenLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.ConversionScreenDocument, options);
}
exports.useConversionScreenLazyQuery = useConversionScreenLazyQuery;
exports.CashoutScreenDocument = (0, client_1.gql) `
    query cashoutScreen {
  me {
    id
    defaultAccount {
      id
      wallets {
        id
        balance
        walletCurrency
      }
    }
  }
}
    `;
/**
 * __useCashoutScreenQuery__
 *
 * To run a query within a React component, call `useCashoutScreenQuery` and pass it any options that fit your needs.
 * When your component renders, `useCashoutScreenQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useCashoutScreenQuery({
 *   variables: {
 *   },
 * });
 */
function useCashoutScreenQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.CashoutScreenDocument, options);
}
exports.useCashoutScreenQuery = useCashoutScreenQuery;
function useCashoutScreenLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.CashoutScreenDocument, options);
}
exports.useCashoutScreenLazyQuery = useCashoutScreenLazyQuery;
exports.WalletCsvTransactionsDocument = (0, client_1.gql) `
    query walletCSVTransactions($walletIds: [WalletId!]!) {
  me {
    id
    defaultAccount {
      id
      csvTransactions(walletIds: $walletIds)
    }
  }
}
    `;
/**
 * __useWalletCsvTransactionsQuery__
 *
 * To run a query within a React component, call `useWalletCsvTransactionsQuery` and pass it any options that fit your needs.
 * When your component renders, `useWalletCsvTransactionsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useWalletCsvTransactionsQuery({
 *   variables: {
 *      walletIds: // value for 'walletIds'
 *   },
 * });
 */
function useWalletCsvTransactionsQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.WalletCsvTransactionsDocument, options);
}
exports.useWalletCsvTransactionsQuery = useWalletCsvTransactionsQuery;
function useWalletCsvTransactionsLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.WalletCsvTransactionsDocument, options);
}
exports.useWalletCsvTransactionsLazyQuery = useWalletCsvTransactionsLazyQuery;
exports.WalletOverviewScreenDocument = (0, client_1.gql) `
    query walletOverviewScreen {
  me {
    id
    defaultAccount {
      id
      wallets {
        id
        balance
        walletCurrency
      }
    }
  }
}
    `;
/**
 * __useWalletOverviewScreenQuery__
 *
 * To run a query within a React component, call `useWalletOverviewScreenQuery` and pass it any options that fit your needs.
 * When your component renders, `useWalletOverviewScreenQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useWalletOverviewScreenQuery({
 *   variables: {
 *   },
 * });
 */
function useWalletOverviewScreenQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.WalletOverviewScreenDocument, options);
}
exports.useWalletOverviewScreenQuery = useWalletOverviewScreenQuery;
function useWalletOverviewScreenLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.WalletOverviewScreenDocument, options);
}
exports.useWalletOverviewScreenLazyQuery = useWalletOverviewScreenLazyQuery;
exports.SendBitcoinDestinationDocument = (0, client_1.gql) `
    query sendBitcoinDestination {
  globals {
    network
  }
  me {
    id
    defaultAccount {
      id
      wallets {
        id
      }
    }
    contacts {
      id
      username
    }
  }
}
    `;
/**
 * __useSendBitcoinDestinationQuery__
 *
 * To run a query within a React component, call `useSendBitcoinDestinationQuery` and pass it any options that fit your needs.
 * When your component renders, `useSendBitcoinDestinationQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSendBitcoinDestinationQuery({
 *   variables: {
 *   },
 * });
 */
function useSendBitcoinDestinationQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.SendBitcoinDestinationDocument, options);
}
exports.useSendBitcoinDestinationQuery = useSendBitcoinDestinationQuery;
function useSendBitcoinDestinationLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.SendBitcoinDestinationDocument, options);
}
exports.useSendBitcoinDestinationLazyQuery = useSendBitcoinDestinationLazyQuery;
exports.AccountDefaultWalletDocument = (0, client_1.gql) `
    query accountDefaultWallet($username: Username!) {
  accountDefaultWallet(username: $username) {
    id
  }
}
    `;
/**
 * __useAccountDefaultWalletQuery__
 *
 * To run a query within a React component, call `useAccountDefaultWalletQuery` and pass it any options that fit your needs.
 * When your component renders, `useAccountDefaultWalletQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAccountDefaultWalletQuery({
 *   variables: {
 *      username: // value for 'username'
 *   },
 * });
 */
function useAccountDefaultWalletQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.AccountDefaultWalletDocument, options);
}
exports.useAccountDefaultWalletQuery = useAccountDefaultWalletQuery;
function useAccountDefaultWalletLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.AccountDefaultWalletDocument, options);
}
exports.useAccountDefaultWalletLazyQuery = useAccountDefaultWalletLazyQuery;
exports.SendBitcoinDetailsScreenDocument = (0, client_1.gql) `
    query sendBitcoinDetailsScreen {
  globals {
    network
  }
  me {
    id
    defaultAccount {
      id
      defaultWalletId
      wallets {
        id
        walletCurrency
        balance
      }
    }
  }
}
    `;
/**
 * __useSendBitcoinDetailsScreenQuery__
 *
 * To run a query within a React component, call `useSendBitcoinDetailsScreenQuery` and pass it any options that fit your needs.
 * When your component renders, `useSendBitcoinDetailsScreenQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSendBitcoinDetailsScreenQuery({
 *   variables: {
 *   },
 * });
 */
function useSendBitcoinDetailsScreenQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.SendBitcoinDetailsScreenDocument, options);
}
exports.useSendBitcoinDetailsScreenQuery = useSendBitcoinDetailsScreenQuery;
function useSendBitcoinDetailsScreenLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.SendBitcoinDetailsScreenDocument, options);
}
exports.useSendBitcoinDetailsScreenLazyQuery = useSendBitcoinDetailsScreenLazyQuery;
exports.SendBitcoinWithdrawalLimitsDocument = (0, client_1.gql) `
    query sendBitcoinWithdrawalLimits {
  me {
    id
    defaultAccount {
      id
      limits {
        withdrawal {
          totalLimit
          remainingLimit
          interval
        }
      }
    }
  }
}
    `;
/**
 * __useSendBitcoinWithdrawalLimitsQuery__
 *
 * To run a query within a React component, call `useSendBitcoinWithdrawalLimitsQuery` and pass it any options that fit your needs.
 * When your component renders, `useSendBitcoinWithdrawalLimitsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSendBitcoinWithdrawalLimitsQuery({
 *   variables: {
 *   },
 * });
 */
function useSendBitcoinWithdrawalLimitsQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.SendBitcoinWithdrawalLimitsDocument, options);
}
exports.useSendBitcoinWithdrawalLimitsQuery = useSendBitcoinWithdrawalLimitsQuery;
function useSendBitcoinWithdrawalLimitsLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.SendBitcoinWithdrawalLimitsDocument, options);
}
exports.useSendBitcoinWithdrawalLimitsLazyQuery = useSendBitcoinWithdrawalLimitsLazyQuery;
exports.SendBitcoinInternalLimitsDocument = (0, client_1.gql) `
    query sendBitcoinInternalLimits {
  me {
    id
    defaultAccount {
      id
      limits {
        internalSend {
          totalLimit
          remainingLimit
          interval
        }
      }
    }
  }
}
    `;
/**
 * __useSendBitcoinInternalLimitsQuery__
 *
 * To run a query within a React component, call `useSendBitcoinInternalLimitsQuery` and pass it any options that fit your needs.
 * When your component renders, `useSendBitcoinInternalLimitsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSendBitcoinInternalLimitsQuery({
 *   variables: {
 *   },
 * });
 */
function useSendBitcoinInternalLimitsQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.SendBitcoinInternalLimitsDocument, options);
}
exports.useSendBitcoinInternalLimitsQuery = useSendBitcoinInternalLimitsQuery;
function useSendBitcoinInternalLimitsLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.SendBitcoinInternalLimitsDocument, options);
}
exports.useSendBitcoinInternalLimitsLazyQuery = useSendBitcoinInternalLimitsLazyQuery;
exports.SendBitcoinConfirmationScreenDocument = (0, client_1.gql) `
    query sendBitcoinConfirmationScreen {
  me {
    id
    defaultAccount {
      id
      wallets {
        id
        balance
        walletCurrency
      }
    }
  }
}
    `;
/**
 * __useSendBitcoinConfirmationScreenQuery__
 *
 * To run a query within a React component, call `useSendBitcoinConfirmationScreenQuery` and pass it any options that fit your needs.
 * When your component renders, `useSendBitcoinConfirmationScreenQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSendBitcoinConfirmationScreenQuery({
 *   variables: {
 *   },
 * });
 */
function useSendBitcoinConfirmationScreenQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.SendBitcoinConfirmationScreenDocument, options);
}
exports.useSendBitcoinConfirmationScreenQuery = useSendBitcoinConfirmationScreenQuery;
function useSendBitcoinConfirmationScreenLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.SendBitcoinConfirmationScreenDocument, options);
}
exports.useSendBitcoinConfirmationScreenLazyQuery = useSendBitcoinConfirmationScreenLazyQuery;
exports.ScanningQrCodeScreenDocument = (0, client_1.gql) `
    query scanningQRCodeScreen {
  globals {
    network
  }
  me {
    id
    defaultAccount {
      id
      wallets {
        id
      }
    }
    contacts {
      id
      username
    }
  }
}
    `;
/**
 * __useScanningQrCodeScreenQuery__
 *
 * To run a query within a React component, call `useScanningQrCodeScreenQuery` and pass it any options that fit your needs.
 * When your component renders, `useScanningQrCodeScreenQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useScanningQrCodeScreenQuery({
 *   variables: {
 *   },
 * });
 */
function useScanningQrCodeScreenQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.ScanningQrCodeScreenDocument, options);
}
exports.useScanningQrCodeScreenQuery = useScanningQrCodeScreenQuery;
function useScanningQrCodeScreenLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.ScanningQrCodeScreenDocument, options);
}
exports.useScanningQrCodeScreenLazyQuery = useScanningQrCodeScreenLazyQuery;
exports.RealtimePriceUnauthedDocument = (0, client_1.gql) `
    query realtimePriceUnauthed($currency: DisplayCurrency!) {
  realtimePrice(currency: $currency) {
    timestamp
    btcSatPrice {
      base
      offset
    }
    usdCentPrice {
      base
      offset
    }
    denominatorCurrency
  }
}
    `;
/**
 * __useRealtimePriceUnauthedQuery__
 *
 * To run a query within a React component, call `useRealtimePriceUnauthedQuery` and pass it any options that fit your needs.
 * When your component renders, `useRealtimePriceUnauthedQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useRealtimePriceUnauthedQuery({
 *   variables: {
 *      currency: // value for 'currency'
 *   },
 * });
 */
function useRealtimePriceUnauthedQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.RealtimePriceUnauthedDocument, options);
}
exports.useRealtimePriceUnauthedQuery = useRealtimePriceUnauthedQuery;
function useRealtimePriceUnauthedLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.RealtimePriceUnauthedDocument, options);
}
exports.useRealtimePriceUnauthedLazyQuery = useRealtimePriceUnauthedLazyQuery;
exports.NpubByUsernameDocument = (0, client_1.gql) `
    query npubByUsername($username: Username!) {
  npubByUsername(username: $username) {
    npub
    username
  }
}
    `;
/**
 * __useNpubByUsernameQuery__
 *
 * To run a query within a React component, call `useNpubByUsernameQuery` and pass it any options that fit your needs.
 * When your component renders, `useNpubByUsernameQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useNpubByUsernameQuery({
 *   variables: {
 *      username: // value for 'username'
 *   },
 * });
 */
function useNpubByUsernameQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.NpubByUsernameDocument, options);
}
exports.useNpubByUsernameQuery = useNpubByUsernameQuery;
function useNpubByUsernameLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.NpubByUsernameDocument, options);
}
exports.useNpubByUsernameLazyQuery = useNpubByUsernameLazyQuery;
exports.RealtimePriceWsDocument = (0, client_1.gql) `
    subscription realtimePriceWs($currency: DisplayCurrency!) {
  realtimePrice(input: {currency: $currency}) {
    errors {
      message
    }
    realtimePrice {
      timestamp
      btcSatPrice {
        base
        offset
      }
      usdCentPrice {
        base
        offset
      }
      denominatorCurrency
    }
  }
}
    `;
/**
 * __useRealtimePriceWsSubscription__
 *
 * To run a query within a React component, call `useRealtimePriceWsSubscription` and pass it any options that fit your needs.
 * When your component renders, `useRealtimePriceWsSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useRealtimePriceWsSubscription({
 *   variables: {
 *      currency: // value for 'currency'
 *   },
 * });
 */
function useRealtimePriceWsSubscription(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useSubscription(exports.RealtimePriceWsDocument, options);
}
exports.useRealtimePriceWsSubscription = useRealtimePriceWsSubscription;
exports.TransactionDetailsDocument = (0, client_1.gql) `
    query transactionDetails($input: TransactionDetailsInput!) {
  transactionDetails(input: $input) {
    errors {
      message
    }
    transactionDetails {
      id
      accountId
      amount
      currency
      status
      type
      createdAt
      updatedAt
      invoice
      paymentHash
      paymentPreimage
      memo
      address
      txid
      vout
      confirmations
      fee
    }
  }
}
    `;
/**
 * __useTransactionDetailsQuery__
 *
 * To run a query within a React component, call `useTransactionDetailsQuery` and pass it any options that fit your needs.
 * When your component renders, `useTransactionDetailsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useTransactionDetailsQuery({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useTransactionDetailsQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.TransactionDetailsDocument, options);
}
exports.useTransactionDetailsQuery = useTransactionDetailsQuery;
function useTransactionDetailsLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.TransactionDetailsDocument, options);
}
exports.useTransactionDetailsLazyQuery = useTransactionDetailsLazyQuery;
exports.NetworkDocument = (0, client_1.gql) `
    query network {
  globals {
    network
  }
}
    `;
/**
 * __useNetworkQuery__
 *
 * To run a query within a React component, call `useNetworkQuery` and pass it any options that fit your needs.
 * When your component renders, `useNetworkQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useNetworkQuery({
 *   variables: {
 *   },
 * });
 */
function useNetworkQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.NetworkDocument, options);
}
exports.useNetworkQuery = useNetworkQuery;
function useNetworkLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.NetworkDocument, options);
}
exports.useNetworkLazyQuery = useNetworkLazyQuery;
exports.LevelDocument = (0, client_1.gql) `
    query level {
  me {
    id
    defaultAccount {
      id
      level
    }
  }
}
    `;
/**
 * __useLevelQuery__
 *
 * To run a query within a React component, call `useLevelQuery` and pass it any options that fit your needs.
 * When your component renders, `useLevelQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useLevelQuery({
 *   variables: {
 *   },
 * });
 */
function useLevelQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.LevelDocument, options);
}
exports.useLevelQuery = useLevelQuery;
function useLevelLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.LevelDocument, options);
}
exports.useLevelLazyQuery = useLevelLazyQuery;
exports.DisplayCurrencyDocument = (0, client_1.gql) `
    query displayCurrency {
  me {
    id
    defaultAccount {
      id
      displayCurrency
    }
  }
}
    `;
/**
 * __useDisplayCurrencyQuery__
 *
 * To run a query within a React component, call `useDisplayCurrencyQuery` and pass it any options that fit your needs.
 * When your component renders, `useDisplayCurrencyQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useDisplayCurrencyQuery({
 *   variables: {
 *   },
 * });
 */
function useDisplayCurrencyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.DisplayCurrencyDocument, options);
}
exports.useDisplayCurrencyQuery = useDisplayCurrencyQuery;
function useDisplayCurrencyLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.DisplayCurrencyDocument, options);
}
exports.useDisplayCurrencyLazyQuery = useDisplayCurrencyLazyQuery;
exports.CurrencyListDocument = (0, client_1.gql) `
    query currencyList {
  currencyList {
    __typename
    id
    flag
    name
    symbol
    fractionDigits
  }
}
    `;
/**
 * __useCurrencyListQuery__
 *
 * To run a query within a React component, call `useCurrencyListQuery` and pass it any options that fit your needs.
 * When your component renders, `useCurrencyListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useCurrencyListQuery({
 *   variables: {
 *   },
 * });
 */
function useCurrencyListQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.CurrencyListDocument, options);
}
exports.useCurrencyListQuery = useCurrencyListQuery;
function useCurrencyListLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.CurrencyListDocument, options);
}
exports.useCurrencyListLazyQuery = useCurrencyListLazyQuery;
exports.CaptchaCreateChallengeDocument = (0, client_1.gql) `
    mutation captchaCreateChallenge {
  captchaCreateChallenge {
    errors {
      message
    }
    result {
      id
      challengeCode
      newCaptcha
      failbackMode
    }
  }
}
    `;
/**
 * __useCaptchaCreateChallengeMutation__
 *
 * To run a mutation, you first call `useCaptchaCreateChallengeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCaptchaCreateChallengeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [captchaCreateChallengeMutation, { data, loading, error }] = useCaptchaCreateChallengeMutation({
 *   variables: {
 *   },
 * });
 */
function useCaptchaCreateChallengeMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.CaptchaCreateChallengeDocument, options);
}
exports.useCaptchaCreateChallengeMutation = useCaptchaCreateChallengeMutation;
exports.LnNoAmountInvoiceFeeProbeDocument = (0, client_1.gql) `
    mutation lnNoAmountInvoiceFeeProbe($input: LnNoAmountInvoiceFeeProbeInput!) {
  lnNoAmountInvoiceFeeProbe(input: $input) {
    errors {
      message
    }
    amount
  }
}
    `;
/**
 * __useLnNoAmountInvoiceFeeProbeMutation__
 *
 * To run a mutation, you first call `useLnNoAmountInvoiceFeeProbeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLnNoAmountInvoiceFeeProbeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [lnNoAmountInvoiceFeeProbeMutation, { data, loading, error }] = useLnNoAmountInvoiceFeeProbeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useLnNoAmountInvoiceFeeProbeMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.LnNoAmountInvoiceFeeProbeDocument, options);
}
exports.useLnNoAmountInvoiceFeeProbeMutation = useLnNoAmountInvoiceFeeProbeMutation;
exports.LnInvoiceFeeProbeDocument = (0, client_1.gql) `
    mutation lnInvoiceFeeProbe($input: LnInvoiceFeeProbeInput!) {
  lnInvoiceFeeProbe(input: $input) {
    errors {
      message
    }
    amount
  }
}
    `;
/**
 * __useLnInvoiceFeeProbeMutation__
 *
 * To run a mutation, you first call `useLnInvoiceFeeProbeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLnInvoiceFeeProbeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [lnInvoiceFeeProbeMutation, { data, loading, error }] = useLnInvoiceFeeProbeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useLnInvoiceFeeProbeMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.LnInvoiceFeeProbeDocument, options);
}
exports.useLnInvoiceFeeProbeMutation = useLnInvoiceFeeProbeMutation;
exports.LnUsdInvoiceFeeProbeDocument = (0, client_1.gql) `
    mutation lnUsdInvoiceFeeProbe($input: LnUsdInvoiceFeeProbeInput!) {
  lnUsdInvoiceFeeProbe(input: $input) {
    errors {
      message
    }
    amount
  }
}
    `;
/**
 * __useLnUsdInvoiceFeeProbeMutation__
 *
 * To run a mutation, you first call `useLnUsdInvoiceFeeProbeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLnUsdInvoiceFeeProbeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [lnUsdInvoiceFeeProbeMutation, { data, loading, error }] = useLnUsdInvoiceFeeProbeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useLnUsdInvoiceFeeProbeMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.LnUsdInvoiceFeeProbeDocument, options);
}
exports.useLnUsdInvoiceFeeProbeMutation = useLnUsdInvoiceFeeProbeMutation;
exports.LnNoAmountUsdInvoiceFeeProbeDocument = (0, client_1.gql) `
    mutation lnNoAmountUsdInvoiceFeeProbe($input: LnNoAmountUsdInvoiceFeeProbeInput!) {
  lnNoAmountUsdInvoiceFeeProbe(input: $input) {
    errors {
      message
    }
    amount
  }
}
    `;
/**
 * __useLnNoAmountUsdInvoiceFeeProbeMutation__
 *
 * To run a mutation, you first call `useLnNoAmountUsdInvoiceFeeProbeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLnNoAmountUsdInvoiceFeeProbeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [lnNoAmountUsdInvoiceFeeProbeMutation, { data, loading, error }] = useLnNoAmountUsdInvoiceFeeProbeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useLnNoAmountUsdInvoiceFeeProbeMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.LnNoAmountUsdInvoiceFeeProbeDocument, options);
}
exports.useLnNoAmountUsdInvoiceFeeProbeMutation = useLnNoAmountUsdInvoiceFeeProbeMutation;
exports.OnChainTxFeeDocument = (0, client_1.gql) `
    query onChainTxFee($walletId: WalletId!, $address: OnChainAddress!, $amount: SatAmount!) {
  onChainTxFee(walletId: $walletId, address: $address, amount: $amount) {
    amount
  }
}
    `;
/**
 * __useOnChainTxFeeQuery__
 *
 * To run a query within a React component, call `useOnChainTxFeeQuery` and pass it any options that fit your needs.
 * When your component renders, `useOnChainTxFeeQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useOnChainTxFeeQuery({
 *   variables: {
 *      walletId: // value for 'walletId'
 *      address: // value for 'address'
 *      amount: // value for 'amount'
 *   },
 * });
 */
function useOnChainTxFeeQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.OnChainTxFeeDocument, options);
}
exports.useOnChainTxFeeQuery = useOnChainTxFeeQuery;
function useOnChainTxFeeLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.OnChainTxFeeDocument, options);
}
exports.useOnChainTxFeeLazyQuery = useOnChainTxFeeLazyQuery;
exports.OnChainUsdTxFeeDocument = (0, client_1.gql) `
    query onChainUsdTxFee($walletId: WalletId!, $address: OnChainAddress!, $amount: CentAmount!) {
  onChainUsdTxFee(walletId: $walletId, address: $address, amount: $amount) {
    amount
  }
}
    `;
/**
 * __useOnChainUsdTxFeeQuery__
 *
 * To run a query within a React component, call `useOnChainUsdTxFeeQuery` and pass it any options that fit your needs.
 * When your component renders, `useOnChainUsdTxFeeQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useOnChainUsdTxFeeQuery({
 *   variables: {
 *      walletId: // value for 'walletId'
 *      address: // value for 'address'
 *      amount: // value for 'amount'
 *   },
 * });
 */
function useOnChainUsdTxFeeQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.OnChainUsdTxFeeDocument, options);
}
exports.useOnChainUsdTxFeeQuery = useOnChainUsdTxFeeQuery;
function useOnChainUsdTxFeeLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.OnChainUsdTxFeeDocument, options);
}
exports.useOnChainUsdTxFeeLazyQuery = useOnChainUsdTxFeeLazyQuery;
exports.OnChainUsdTxFeeAsBtcDenominatedDocument = (0, client_1.gql) `
    query onChainUsdTxFeeAsBtcDenominated($walletId: WalletId!, $address: OnChainAddress!, $amount: SatAmount!) {
  onChainUsdTxFeeAsBtcDenominated(
    walletId: $walletId
    address: $address
    amount: $amount
  ) {
    amount
  }
}
    `;
/**
 * __useOnChainUsdTxFeeAsBtcDenominatedQuery__
 *
 * To run a query within a React component, call `useOnChainUsdTxFeeAsBtcDenominatedQuery` and pass it any options that fit your needs.
 * When your component renders, `useOnChainUsdTxFeeAsBtcDenominatedQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useOnChainUsdTxFeeAsBtcDenominatedQuery({
 *   variables: {
 *      walletId: // value for 'walletId'
 *      address: // value for 'address'
 *      amount: // value for 'amount'
 *   },
 * });
 */
function useOnChainUsdTxFeeAsBtcDenominatedQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.OnChainUsdTxFeeAsBtcDenominatedDocument, options);
}
exports.useOnChainUsdTxFeeAsBtcDenominatedQuery = useOnChainUsdTxFeeAsBtcDenominatedQuery;
function useOnChainUsdTxFeeAsBtcDenominatedLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.OnChainUsdTxFeeAsBtcDenominatedDocument, options);
}
exports.useOnChainUsdTxFeeAsBtcDenominatedLazyQuery = useOnChainUsdTxFeeAsBtcDenominatedLazyQuery;
exports.TransactionListForContactDocument = (0, client_1.gql) `
    query transactionListForContact($username: Username!, $first: Int, $after: String, $last: Int, $before: String) {
  me {
    id
    contactByUsername(username: $username) {
      transactions(first: $first, after: $after, last: $last, before: $before) {
        ...TransactionList
      }
    }
  }
}
    ${exports.TransactionListFragmentDoc}`;
/**
 * __useTransactionListForContactQuery__
 *
 * To run a query within a React component, call `useTransactionListForContactQuery` and pass it any options that fit your needs.
 * When your component renders, `useTransactionListForContactQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useTransactionListForContactQuery({
 *   variables: {
 *      username: // value for 'username'
 *      first: // value for 'first'
 *      after: // value for 'after'
 *      last: // value for 'last'
 *      before: // value for 'before'
 *   },
 * });
 */
function useTransactionListForContactQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.TransactionListForContactDocument, options);
}
exports.useTransactionListForContactQuery = useTransactionListForContactQuery;
function useTransactionListForContactLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.TransactionListForContactDocument, options);
}
exports.useTransactionListForContactLazyQuery = useTransactionListForContactLazyQuery;
exports.UserContactUpdateAliasDocument = (0, client_1.gql) `
    mutation userContactUpdateAlias($input: UserContactUpdateAliasInput!) {
  userContactUpdateAlias(input: $input) {
    errors {
      message
    }
    contact {
      alias
      id
    }
  }
}
    `;
/**
 * __useUserContactUpdateAliasMutation__
 *
 * To run a mutation, you first call `useUserContactUpdateAliasMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserContactUpdateAliasMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userContactUpdateAliasMutation, { data, loading, error }] = useUserContactUpdateAliasMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserContactUpdateAliasMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserContactUpdateAliasDocument, options);
}
exports.useUserContactUpdateAliasMutation = useUserContactUpdateAliasMutation;
exports.ContactsDocument = (0, client_1.gql) `
    query contacts {
  me {
    id
    contacts {
      id
      username
      alias
      transactionsCount
    }
  }
}
    `;
/**
 * __useContactsQuery__
 *
 * To run a query within a React component, call `useContactsQuery` and pass it any options that fit your needs.
 * When your component renders, `useContactsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useContactsQuery({
 *   variables: {
 *   },
 * });
 */
function useContactsQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.ContactsDocument, options);
}
exports.useContactsQuery = useContactsQuery;
function useContactsLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.ContactsDocument, options);
}
exports.useContactsLazyQuery = useContactsLazyQuery;
exports.QuizSatsDocument = (0, client_1.gql) `
    query quizSats {
  quizQuestions {
    id
    earnAmount
  }
}
    `;
/**
 * __useQuizSatsQuery__
 *
 * To run a query within a React component, call `useQuizSatsQuery` and pass it any options that fit your needs.
 * When your component renders, `useQuizSatsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useQuizSatsQuery({
 *   variables: {
 *   },
 * });
 */
function useQuizSatsQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.QuizSatsDocument, options);
}
exports.useQuizSatsQuery = useQuizSatsQuery;
function useQuizSatsLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.QuizSatsDocument, options);
}
exports.useQuizSatsLazyQuery = useQuizSatsLazyQuery;
exports.MyQuizQuestionsDocument = (0, client_1.gql) `
    query myQuizQuestions {
  me {
    id
    defaultAccount {
      id
      ... on ConsumerAccount {
        quiz {
          id
          amount
          completed
        }
      }
    }
  }
}
    `;
/**
 * __useMyQuizQuestionsQuery__
 *
 * To run a query within a React component, call `useMyQuizQuestionsQuery` and pass it any options that fit your needs.
 * When your component renders, `useMyQuizQuestionsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useMyQuizQuestionsQuery({
 *   variables: {
 *   },
 * });
 */
function useMyQuizQuestionsQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.MyQuizQuestionsDocument, options);
}
exports.useMyQuizQuestionsQuery = useMyQuizQuestionsQuery;
function useMyQuizQuestionsLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.MyQuizQuestionsDocument, options);
}
exports.useMyQuizQuestionsLazyQuery = useMyQuizQuestionsLazyQuery;
exports.QuizCompletedDocument = (0, client_1.gql) `
    mutation quizCompleted($input: QuizCompletedInput!) {
  quizCompleted(input: $input) {
    errors {
      message
    }
    quiz {
      id
      completed
    }
  }
}
    `;
/**
 * __useQuizCompletedMutation__
 *
 * To run a mutation, you first call `useQuizCompletedMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useQuizCompletedMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [quizCompletedMutation, { data, loading, error }] = useQuizCompletedMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useQuizCompletedMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.QuizCompletedDocument, options);
}
exports.useQuizCompletedMutation = useQuizCompletedMutation;
exports.UserEmailRegistrationInitiateDocument = (0, client_1.gql) `
    mutation userEmailRegistrationInitiate($input: UserEmailRegistrationInitiateInput!) {
  userEmailRegistrationInitiate(input: $input) {
    errors {
      message
    }
    emailRegistrationId
    me {
      id
      email {
        address
        verified
      }
    }
  }
}
    `;
/**
 * __useUserEmailRegistrationInitiateMutation__
 *
 * To run a mutation, you first call `useUserEmailRegistrationInitiateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserEmailRegistrationInitiateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userEmailRegistrationInitiateMutation, { data, loading, error }] = useUserEmailRegistrationInitiateMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserEmailRegistrationInitiateMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserEmailRegistrationInitiateDocument, options);
}
exports.useUserEmailRegistrationInitiateMutation = useUserEmailRegistrationInitiateMutation;
exports.UserEmailRegistrationValidateDocument = (0, client_1.gql) `
    mutation userEmailRegistrationValidate($input: UserEmailRegistrationValidateInput!) {
  userEmailRegistrationValidate(input: $input) {
    errors {
      message
    }
    me {
      id
      email {
        address
        verified
      }
    }
  }
}
    `;
/**
 * __useUserEmailRegistrationValidateMutation__
 *
 * To run a mutation, you first call `useUserEmailRegistrationValidateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserEmailRegistrationValidateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userEmailRegistrationValidateMutation, { data, loading, error }] = useUserEmailRegistrationValidateMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserEmailRegistrationValidateMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserEmailRegistrationValidateDocument, options);
}
exports.useUserEmailRegistrationValidateMutation = useUserEmailRegistrationValidateMutation;
exports.AddressScreenDocument = (0, client_1.gql) `
    query addressScreen {
  me {
    id
    username
  }
}
    `;
/**
 * __useAddressScreenQuery__
 *
 * To run a query within a React component, call `useAddressScreenQuery` and pass it any options that fit your needs.
 * When your component renders, `useAddressScreenQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAddressScreenQuery({
 *   variables: {
 *   },
 * });
 */
function useAddressScreenQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.AddressScreenDocument, options);
}
exports.useAddressScreenQuery = useAddressScreenQuery;
function useAddressScreenLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.AddressScreenDocument, options);
}
exports.useAddressScreenLazyQuery = useAddressScreenLazyQuery;
exports.BusinessMapMarkersDocument = (0, client_1.gql) `
    query businessMapMarkers {
  businessMapMarkers {
    username
    mapInfo {
      title
      coordinates {
        longitude
        latitude
      }
    }
  }
}
    `;
/**
 * __useBusinessMapMarkersQuery__
 *
 * To run a query within a React component, call `useBusinessMapMarkersQuery` and pass it any options that fit your needs.
 * When your component renders, `useBusinessMapMarkersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useBusinessMapMarkersQuery({
 *   variables: {
 *   },
 * });
 */
function useBusinessMapMarkersQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.BusinessMapMarkersDocument, options);
}
exports.useBusinessMapMarkersQuery = useBusinessMapMarkersQuery;
function useBusinessMapMarkersLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.BusinessMapMarkersDocument, options);
}
exports.useBusinessMapMarkersLazyQuery = useBusinessMapMarkersLazyQuery;
exports.UserLoginDocument = (0, client_1.gql) `
    mutation userLogin($input: UserLoginInput!) {
  userLogin(input: $input) {
    errors {
      message
      code
    }
    authToken
    totpRequired
  }
}
    `;
/**
 * __useUserLoginMutation__
 *
 * To run a mutation, you first call `useUserLoginMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserLoginMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userLoginMutation, { data, loading, error }] = useUserLoginMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserLoginMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserLoginDocument, options);
}
exports.useUserLoginMutation = useUserLoginMutation;
exports.UserLoginUpgradeDocument = (0, client_1.gql) `
    mutation userLoginUpgrade($input: UserLoginUpgradeInput!) {
  userLoginUpgrade(input: $input) {
    errors {
      message
      code
    }
    success
    authToken
  }
}
    `;
/**
 * __useUserLoginUpgradeMutation__
 *
 * To run a mutation, you first call `useUserLoginUpgradeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserLoginUpgradeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userLoginUpgradeMutation, { data, loading, error }] = useUserLoginUpgradeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserLoginUpgradeMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserLoginUpgradeDocument, options);
}
exports.useUserLoginUpgradeMutation = useUserLoginUpgradeMutation;
exports.UserPhoneRegistrationValidateDocument = (0, client_1.gql) `
    mutation userPhoneRegistrationValidate($input: UserPhoneRegistrationValidateInput!) {
  userPhoneRegistrationValidate(input: $input) {
    errors {
      message
      code
    }
    me {
      id
      phone
      email {
        address
        verified
      }
    }
  }
}
    `;
/**
 * __useUserPhoneRegistrationValidateMutation__
 *
 * To run a mutation, you first call `useUserPhoneRegistrationValidateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserPhoneRegistrationValidateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userPhoneRegistrationValidateMutation, { data, loading, error }] = useUserPhoneRegistrationValidateMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserPhoneRegistrationValidateMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserPhoneRegistrationValidateDocument, options);
}
exports.useUserPhoneRegistrationValidateMutation = useUserPhoneRegistrationValidateMutation;
exports.CaptchaRequestAuthCodeDocument = (0, client_1.gql) `
    mutation captchaRequestAuthCode($input: CaptchaRequestAuthCodeInput!) {
  captchaRequestAuthCode(input: $input) {
    errors {
      message
      code
    }
    success
  }
}
    `;
/**
 * __useCaptchaRequestAuthCodeMutation__
 *
 * To run a mutation, you first call `useCaptchaRequestAuthCodeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCaptchaRequestAuthCodeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [captchaRequestAuthCodeMutation, { data, loading, error }] = useCaptchaRequestAuthCodeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useCaptchaRequestAuthCodeMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.CaptchaRequestAuthCodeDocument, options);
}
exports.useCaptchaRequestAuthCodeMutation = useCaptchaRequestAuthCodeMutation;
exports.SupportedCountriesDocument = (0, client_1.gql) `
    query supportedCountries {
  globals {
    supportedCountries {
      id
      supportedAuthChannels
    }
  }
}
    `;
/**
 * __useSupportedCountriesQuery__
 *
 * To run a query within a React component, call `useSupportedCountriesQuery` and pass it any options that fit your needs.
 * When your component renders, `useSupportedCountriesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSupportedCountriesQuery({
 *   variables: {
 *   },
 * });
 */
function useSupportedCountriesQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.SupportedCountriesDocument, options);
}
exports.useSupportedCountriesQuery = useSupportedCountriesQuery;
function useSupportedCountriesLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.SupportedCountriesDocument, options);
}
exports.useSupportedCountriesLazyQuery = useSupportedCountriesLazyQuery;
exports.UserPhoneRegistrationInitiateDocument = (0, client_1.gql) `
    mutation userPhoneRegistrationInitiate($input: UserPhoneRegistrationInitiateInput!) {
  userPhoneRegistrationInitiate(input: $input) {
    errors {
      message
    }
    success
  }
}
    `;
/**
 * __useUserPhoneRegistrationInitiateMutation__
 *
 * To run a mutation, you first call `useUserPhoneRegistrationInitiateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserPhoneRegistrationInitiateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userPhoneRegistrationInitiateMutation, { data, loading, error }] = useUserPhoneRegistrationInitiateMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserPhoneRegistrationInitiateMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserPhoneRegistrationInitiateDocument, options);
}
exports.useUserPhoneRegistrationInitiateMutation = useUserPhoneRegistrationInitiateMutation;
exports.MyLnUpdatesDocument = (0, client_1.gql) `
    subscription myLnUpdates {
  myUpdates {
    errors {
      message
    }
    update {
      ... on LnUpdate {
        paymentHash
        status
      }
    }
  }
}
    `;
/**
 * __useMyLnUpdatesSubscription__
 *
 * To run a query within a React component, call `useMyLnUpdatesSubscription` and pass it any options that fit your needs.
 * When your component renders, `useMyLnUpdatesSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useMyLnUpdatesSubscription({
 *   variables: {
 *   },
 * });
 */
function useMyLnUpdatesSubscription(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useSubscription(exports.MyLnUpdatesDocument, options);
}
exports.useMyLnUpdatesSubscription = useMyLnUpdatesSubscription;
exports.PaymentRequestDocument = (0, client_1.gql) `
    query paymentRequest {
  globals {
    network
    feesInformation {
      deposit {
        minBankFee
        minBankFeeThreshold
      }
    }
  }
  me {
    id
    username
    defaultAccount {
      id
      wallets {
        id
        balance
        walletCurrency
      }
      defaultWalletId
    }
  }
}
    `;
/**
 * __usePaymentRequestQuery__
 *
 * To run a query within a React component, call `usePaymentRequestQuery` and pass it any options that fit your needs.
 * When your component renders, `usePaymentRequestQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = usePaymentRequestQuery({
 *   variables: {
 *   },
 * });
 */
function usePaymentRequestQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.PaymentRequestDocument, options);
}
exports.usePaymentRequestQuery = usePaymentRequestQuery;
function usePaymentRequestLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.PaymentRequestDocument, options);
}
exports.usePaymentRequestLazyQuery = usePaymentRequestLazyQuery;
exports.LnNoAmountInvoiceCreateDocument = (0, client_1.gql) `
    mutation lnNoAmountInvoiceCreate($input: LnNoAmountInvoiceCreateInput!) {
  lnNoAmountInvoiceCreate(input: $input) {
    errors {
      message
    }
    invoice {
      paymentHash
      paymentRequest
      paymentSecret
    }
  }
}
    `;
/**
 * __useLnNoAmountInvoiceCreateMutation__
 *
 * To run a mutation, you first call `useLnNoAmountInvoiceCreateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLnNoAmountInvoiceCreateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [lnNoAmountInvoiceCreateMutation, { data, loading, error }] = useLnNoAmountInvoiceCreateMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useLnNoAmountInvoiceCreateMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.LnNoAmountInvoiceCreateDocument, options);
}
exports.useLnNoAmountInvoiceCreateMutation = useLnNoAmountInvoiceCreateMutation;
exports.LnInvoiceCreateDocument = (0, client_1.gql) `
    mutation lnInvoiceCreate($input: LnInvoiceCreateInput!) {
  lnInvoiceCreate(input: $input) {
    errors {
      message
    }
    invoice {
      paymentHash
      paymentRequest
      paymentSecret
      satoshis
    }
  }
}
    `;
/**
 * __useLnInvoiceCreateMutation__
 *
 * To run a mutation, you first call `useLnInvoiceCreateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLnInvoiceCreateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [lnInvoiceCreateMutation, { data, loading, error }] = useLnInvoiceCreateMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useLnInvoiceCreateMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.LnInvoiceCreateDocument, options);
}
exports.useLnInvoiceCreateMutation = useLnInvoiceCreateMutation;
exports.OnChainAddressCurrentDocument = (0, client_1.gql) `
    mutation onChainAddressCurrent($input: OnChainAddressCurrentInput!) {
  onChainAddressCurrent(input: $input) {
    errors {
      message
    }
    address
  }
}
    `;
/**
 * __useOnChainAddressCurrentMutation__
 *
 * To run a mutation, you first call `useOnChainAddressCurrentMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useOnChainAddressCurrentMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [onChainAddressCurrentMutation, { data, loading, error }] = useOnChainAddressCurrentMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useOnChainAddressCurrentMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.OnChainAddressCurrentDocument, options);
}
exports.useOnChainAddressCurrentMutation = useOnChainAddressCurrentMutation;
exports.LnUsdInvoiceCreateDocument = (0, client_1.gql) `
    mutation lnUsdInvoiceCreate($input: LnUsdInvoiceCreateInput!) {
  lnUsdInvoiceCreate(input: $input) {
    errors {
      message
    }
    invoice {
      paymentHash
      paymentRequest
      paymentSecret
      satoshis
    }
  }
}
    `;
/**
 * __useLnUsdInvoiceCreateMutation__
 *
 * To run a mutation, you first call `useLnUsdInvoiceCreateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLnUsdInvoiceCreateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [lnUsdInvoiceCreateMutation, { data, loading, error }] = useLnUsdInvoiceCreateMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useLnUsdInvoiceCreateMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.LnUsdInvoiceCreateDocument, options);
}
exports.useLnUsdInvoiceCreateMutation = useLnUsdInvoiceCreateMutation;
exports.FeedbackSubmitDocument = (0, client_1.gql) `
    mutation feedbackSubmit($input: FeedbackSubmitInput!) {
  feedbackSubmit(input: $input) {
    errors {
      message
      __typename
    }
    success
    __typename
  }
}
    `;
/**
 * __useFeedbackSubmitMutation__
 *
 * To run a mutation, you first call `useFeedbackSubmitMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useFeedbackSubmitMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [feedbackSubmitMutation, { data, loading, error }] = useFeedbackSubmitMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useFeedbackSubmitMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.FeedbackSubmitDocument, options);
}
exports.useFeedbackSubmitMutation = useFeedbackSubmitMutation;
exports.AccountScreenDocument = (0, client_1.gql) `
    query accountScreen {
  me {
    id
    phone
    totpEnabled
    email {
      address
      verified
    }
    defaultAccount {
      id
      level
      wallets {
        id
        balance
        walletCurrency
      }
    }
  }
}
    `;
/**
 * __useAccountScreenQuery__
 *
 * To run a query within a React component, call `useAccountScreenQuery` and pass it any options that fit your needs.
 * When your component renders, `useAccountScreenQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAccountScreenQuery({
 *   variables: {
 *   },
 * });
 */
function useAccountScreenQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.AccountScreenDocument, options);
}
exports.useAccountScreenQuery = useAccountScreenQuery;
function useAccountScreenLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.AccountScreenDocument, options);
}
exports.useAccountScreenLazyQuery = useAccountScreenLazyQuery;
exports.UserEmailDeleteDocument = (0, client_1.gql) `
    mutation userEmailDelete {
  userEmailDelete {
    errors {
      message
    }
    me {
      id
      phone
      totpEnabled
      email {
        address
        verified
      }
    }
  }
}
    `;
/**
 * __useUserEmailDeleteMutation__
 *
 * To run a mutation, you first call `useUserEmailDeleteMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserEmailDeleteMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userEmailDeleteMutation, { data, loading, error }] = useUserEmailDeleteMutation({
 *   variables: {
 *   },
 * });
 */
function useUserEmailDeleteMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserEmailDeleteDocument, options);
}
exports.useUserEmailDeleteMutation = useUserEmailDeleteMutation;
exports.UserPhoneDeleteDocument = (0, client_1.gql) `
    mutation userPhoneDelete {
  userPhoneDelete {
    errors {
      message
    }
    me {
      id
      phone
      totpEnabled
      email {
        address
        verified
      }
    }
  }
}
    `;
/**
 * __useUserPhoneDeleteMutation__
 *
 * To run a mutation, you first call `useUserPhoneDeleteMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserPhoneDeleteMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userPhoneDeleteMutation, { data, loading, error }] = useUserPhoneDeleteMutation({
 *   variables: {
 *   },
 * });
 */
function useUserPhoneDeleteMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserPhoneDeleteDocument, options);
}
exports.useUserPhoneDeleteMutation = useUserPhoneDeleteMutation;
exports.UserTotpDeleteDocument = (0, client_1.gql) `
    mutation userTotpDelete($input: UserTotpDeleteInput!) {
  userTotpDelete(input: $input) {
    errors {
      message
    }
    me {
      id
      phone
      totpEnabled
      email {
        address
        verified
      }
    }
  }
}
    `;
/**
 * __useUserTotpDeleteMutation__
 *
 * To run a mutation, you first call `useUserTotpDeleteMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserTotpDeleteMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userTotpDeleteMutation, { data, loading, error }] = useUserTotpDeleteMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserTotpDeleteMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserTotpDeleteDocument, options);
}
exports.useUserTotpDeleteMutation = useUserTotpDeleteMutation;
exports.WarningSecureAccountDocument = (0, client_1.gql) `
    query warningSecureAccount {
  me {
    id
    defaultAccount {
      level
      id
      wallets {
        id
        balance
        walletCurrency
      }
    }
  }
}
    `;
/**
 * __useWarningSecureAccountQuery__
 *
 * To run a query within a React component, call `useWarningSecureAccountQuery` and pass it any options that fit your needs.
 * When your component renders, `useWarningSecureAccountQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useWarningSecureAccountQuery({
 *   variables: {
 *   },
 * });
 */
function useWarningSecureAccountQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.WarningSecureAccountDocument, options);
}
exports.useWarningSecureAccountQuery = useWarningSecureAccountQuery;
function useWarningSecureAccountLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.WarningSecureAccountDocument, options);
}
exports.useWarningSecureAccountLazyQuery = useWarningSecureAccountLazyQuery;
exports.AccountUpdateDefaultWalletIdDocument = (0, client_1.gql) `
    mutation accountUpdateDefaultWalletId($input: AccountUpdateDefaultWalletIdInput!) {
  accountUpdateDefaultWalletId(input: $input) {
    errors {
      message
    }
    account {
      id
      defaultWalletId
    }
  }
}
    `;
/**
 * __useAccountUpdateDefaultWalletIdMutation__
 *
 * To run a mutation, you first call `useAccountUpdateDefaultWalletIdMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAccountUpdateDefaultWalletIdMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [accountUpdateDefaultWalletIdMutation, { data, loading, error }] = useAccountUpdateDefaultWalletIdMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useAccountUpdateDefaultWalletIdMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.AccountUpdateDefaultWalletIdDocument, options);
}
exports.useAccountUpdateDefaultWalletIdMutation = useAccountUpdateDefaultWalletIdMutation;
exports.SetDefaultWalletScreenDocument = (0, client_1.gql) `
    query setDefaultWalletScreen {
  me {
    id
    defaultAccount {
      id
      defaultWalletId
      wallets {
        id
        balance
        walletCurrency
      }
    }
  }
}
    `;
/**
 * __useSetDefaultWalletScreenQuery__
 *
 * To run a query within a React component, call `useSetDefaultWalletScreenQuery` and pass it any options that fit your needs.
 * When your component renders, `useSetDefaultWalletScreenQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSetDefaultWalletScreenQuery({
 *   variables: {
 *   },
 * });
 */
function useSetDefaultWalletScreenQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.SetDefaultWalletScreenDocument, options);
}
exports.useSetDefaultWalletScreenQuery = useSetDefaultWalletScreenQuery;
function useSetDefaultWalletScreenLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.SetDefaultWalletScreenDocument, options);
}
exports.useSetDefaultWalletScreenLazyQuery = useSetDefaultWalletScreenLazyQuery;
exports.AccountUpdateDisplayCurrencyDocument = (0, client_1.gql) `
    mutation accountUpdateDisplayCurrency($input: AccountUpdateDisplayCurrencyInput!) {
  accountUpdateDisplayCurrency(input: $input) {
    errors {
      message
    }
    account {
      id
      displayCurrency
    }
  }
}
    `;
/**
 * __useAccountUpdateDisplayCurrencyMutation__
 *
 * To run a mutation, you first call `useAccountUpdateDisplayCurrencyMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAccountUpdateDisplayCurrencyMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [accountUpdateDisplayCurrencyMutation, { data, loading, error }] = useAccountUpdateDisplayCurrencyMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useAccountUpdateDisplayCurrencyMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.AccountUpdateDisplayCurrencyDocument, options);
}
exports.useAccountUpdateDisplayCurrencyMutation = useAccountUpdateDisplayCurrencyMutation;
exports.LanguageDocument = (0, client_1.gql) `
    query language {
  me {
    id
    language
  }
}
    `;
/**
 * __useLanguageQuery__
 *
 * To run a query within a React component, call `useLanguageQuery` and pass it any options that fit your needs.
 * When your component renders, `useLanguageQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useLanguageQuery({
 *   variables: {
 *   },
 * });
 */
function useLanguageQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.LanguageDocument, options);
}
exports.useLanguageQuery = useLanguageQuery;
function useLanguageLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.LanguageDocument, options);
}
exports.useLanguageLazyQuery = useLanguageLazyQuery;
exports.UserUpdateLanguageDocument = (0, client_1.gql) `
    mutation userUpdateLanguage($input: UserUpdateLanguageInput!) {
  userUpdateLanguage(input: $input) {
    errors {
      message
    }
    user {
      id
      language
    }
  }
}
    `;
/**
 * __useUserUpdateLanguageMutation__
 *
 * To run a mutation, you first call `useUserUpdateLanguageMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserUpdateLanguageMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userUpdateLanguageMutation, { data, loading, error }] = useUserUpdateLanguageMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserUpdateLanguageMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserUpdateLanguageDocument, options);
}
exports.useUserUpdateLanguageMutation = useUserUpdateLanguageMutation;
exports.NotificationSettingsDocument = (0, client_1.gql) `
    query notificationSettings {
  me {
    id
    defaultAccount {
      id
      notificationSettings {
        push {
          enabled
          disabledCategories
        }
      }
    }
  }
}
    `;
/**
 * __useNotificationSettingsQuery__
 *
 * To run a query within a React component, call `useNotificationSettingsQuery` and pass it any options that fit your needs.
 * When your component renders, `useNotificationSettingsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useNotificationSettingsQuery({
 *   variables: {
 *   },
 * });
 */
function useNotificationSettingsQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.NotificationSettingsDocument, options);
}
exports.useNotificationSettingsQuery = useNotificationSettingsQuery;
function useNotificationSettingsLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.NotificationSettingsDocument, options);
}
exports.useNotificationSettingsLazyQuery = useNotificationSettingsLazyQuery;
exports.AccountEnableNotificationChannelDocument = (0, client_1.gql) `
    mutation accountEnableNotificationChannel($input: AccountEnableNotificationChannelInput!) {
  accountEnableNotificationChannel(input: $input) {
    errors {
      message
    }
    account {
      id
      notificationSettings {
        push {
          enabled
          disabledCategories
        }
      }
    }
  }
}
    `;
/**
 * __useAccountEnableNotificationChannelMutation__
 *
 * To run a mutation, you first call `useAccountEnableNotificationChannelMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAccountEnableNotificationChannelMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [accountEnableNotificationChannelMutation, { data, loading, error }] = useAccountEnableNotificationChannelMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useAccountEnableNotificationChannelMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.AccountEnableNotificationChannelDocument, options);
}
exports.useAccountEnableNotificationChannelMutation = useAccountEnableNotificationChannelMutation;
exports.AccountDisableNotificationChannelDocument = (0, client_1.gql) `
    mutation accountDisableNotificationChannel($input: AccountDisableNotificationChannelInput!) {
  accountDisableNotificationChannel(input: $input) {
    errors {
      message
    }
    account {
      id
      notificationSettings {
        push {
          enabled
          disabledCategories
        }
      }
    }
  }
}
    `;
/**
 * __useAccountDisableNotificationChannelMutation__
 *
 * To run a mutation, you first call `useAccountDisableNotificationChannelMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAccountDisableNotificationChannelMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [accountDisableNotificationChannelMutation, { data, loading, error }] = useAccountDisableNotificationChannelMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useAccountDisableNotificationChannelMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.AccountDisableNotificationChannelDocument, options);
}
exports.useAccountDisableNotificationChannelMutation = useAccountDisableNotificationChannelMutation;
exports.AccountEnableNotificationCategoryDocument = (0, client_1.gql) `
    mutation accountEnableNotificationCategory($input: AccountEnableNotificationCategoryInput!) {
  accountEnableNotificationCategory(input: $input) {
    errors {
      message
    }
    account {
      id
      notificationSettings {
        push {
          enabled
          disabledCategories
        }
      }
    }
  }
}
    `;
/**
 * __useAccountEnableNotificationCategoryMutation__
 *
 * To run a mutation, you first call `useAccountEnableNotificationCategoryMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAccountEnableNotificationCategoryMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [accountEnableNotificationCategoryMutation, { data, loading, error }] = useAccountEnableNotificationCategoryMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useAccountEnableNotificationCategoryMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.AccountEnableNotificationCategoryDocument, options);
}
exports.useAccountEnableNotificationCategoryMutation = useAccountEnableNotificationCategoryMutation;
exports.AccountDisableNotificationCategoryDocument = (0, client_1.gql) `
    mutation accountDisableNotificationCategory($input: AccountDisableNotificationCategoryInput!) {
  accountDisableNotificationCategory(input: $input) {
    errors {
      message
    }
    account {
      id
      notificationSettings {
        push {
          enabled
          disabledCategories
        }
      }
    }
  }
}
    `;
/**
 * __useAccountDisableNotificationCategoryMutation__
 *
 * To run a mutation, you first call `useAccountDisableNotificationCategoryMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAccountDisableNotificationCategoryMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [accountDisableNotificationCategoryMutation, { data, loading, error }] = useAccountDisableNotificationCategoryMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useAccountDisableNotificationCategoryMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.AccountDisableNotificationCategoryDocument, options);
}
exports.useAccountDisableNotificationCategoryMutation = useAccountDisableNotificationCategoryMutation;
exports.SettingsScreenDocument = (0, client_1.gql) `
    query settingsScreen {
  me {
    id
    phone
    username
    language
    defaultAccount {
      id
      defaultWalletId
      wallets {
        id
        balance
        walletCurrency
      }
    }
    totpEnabled
    email {
      address
      verified
    }
  }
}
    `;
/**
 * __useSettingsScreenQuery__
 *
 * To run a query within a React component, call `useSettingsScreenQuery` and pass it any options that fit your needs.
 * When your component renders, `useSettingsScreenQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSettingsScreenQuery({
 *   variables: {
 *   },
 * });
 */
function useSettingsScreenQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.SettingsScreenDocument, options);
}
exports.useSettingsScreenQuery = useSettingsScreenQuery;
function useSettingsScreenLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.SettingsScreenDocument, options);
}
exports.useSettingsScreenLazyQuery = useSettingsScreenLazyQuery;
exports.ExportCsvSettingDocument = (0, client_1.gql) `
    query ExportCsvSetting($walletIds: [WalletId!]!) {
  me {
    id
    defaultAccount {
      id
      csvTransactions(walletIds: $walletIds)
    }
  }
}
    `;
/**
 * __useExportCsvSettingQuery__
 *
 * To run a query within a React component, call `useExportCsvSettingQuery` and pass it any options that fit your needs.
 * When your component renders, `useExportCsvSettingQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useExportCsvSettingQuery({
 *   variables: {
 *      walletIds: // value for 'walletIds'
 *   },
 * });
 */
function useExportCsvSettingQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.ExportCsvSettingDocument, options);
}
exports.useExportCsvSettingQuery = useExportCsvSettingQuery;
function useExportCsvSettingLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.ExportCsvSettingDocument, options);
}
exports.useExportCsvSettingLazyQuery = useExportCsvSettingLazyQuery;
exports.UserTotpDeleteADocument = (0, client_1.gql) `
    mutation userTotpDeleteA($input: UserTotpDeleteInput!) {
  userTotpDelete(input: $input) {
    errors {
      message
    }
    me {
      id
      phone
      totpEnabled
      email {
        address
        verified
      }
    }
  }
}
    `;
/**
 * __useUserTotpDeleteAMutation__
 *
 * To run a mutation, you first call `useUserTotpDeleteAMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserTotpDeleteAMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userTotpDeleteAMutation, { data, loading, error }] = useUserTotpDeleteAMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserTotpDeleteAMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserTotpDeleteADocument, options);
}
exports.useUserTotpDeleteAMutation = useUserTotpDeleteAMutation;
exports.AccountLimitsDocument = (0, client_1.gql) `
    query accountLimits {
  me {
    id
    defaultAccount {
      id
      limits {
        withdrawal {
          totalLimit
          remainingLimit
          interval
        }
        internalSend {
          totalLimit
          remainingLimit
          interval
        }
        convert {
          totalLimit
          remainingLimit
          interval
        }
      }
    }
  }
}
    `;
/**
 * __useAccountLimitsQuery__
 *
 * To run a query within a React component, call `useAccountLimitsQuery` and pass it any options that fit your needs.
 * When your component renders, `useAccountLimitsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAccountLimitsQuery({
 *   variables: {
 *   },
 * });
 */
function useAccountLimitsQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.AccountLimitsDocument, options);
}
exports.useAccountLimitsQuery = useAccountLimitsQuery;
function useAccountLimitsLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.AccountLimitsDocument, options);
}
exports.useAccountLimitsLazyQuery = useAccountLimitsLazyQuery;
exports.TotpRegistrationScreenDocument = (0, client_1.gql) `
    query totpRegistrationScreen {
  me {
    username
  }
}
    `;
/**
 * __useTotpRegistrationScreenQuery__
 *
 * To run a query within a React component, call `useTotpRegistrationScreenQuery` and pass it any options that fit your needs.
 * When your component renders, `useTotpRegistrationScreenQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useTotpRegistrationScreenQuery({
 *   variables: {
 *   },
 * });
 */
function useTotpRegistrationScreenQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.TotpRegistrationScreenDocument, options);
}
exports.useTotpRegistrationScreenQuery = useTotpRegistrationScreenQuery;
function useTotpRegistrationScreenLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.TotpRegistrationScreenDocument, options);
}
exports.useTotpRegistrationScreenLazyQuery = useTotpRegistrationScreenLazyQuery;
exports.UserTotpRegistrationInitiateDocument = (0, client_1.gql) `
    mutation userTotpRegistrationInitiate($input: UserTotpRegistrationInitiateInput!) {
  userTotpRegistrationInitiate(input: $input) {
    errors {
      message
    }
    totpRegistrationId
    totpSecret
  }
}
    `;
/**
 * __useUserTotpRegistrationInitiateMutation__
 *
 * To run a mutation, you first call `useUserTotpRegistrationInitiateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserTotpRegistrationInitiateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userTotpRegistrationInitiateMutation, { data, loading, error }] = useUserTotpRegistrationInitiateMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserTotpRegistrationInitiateMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserTotpRegistrationInitiateDocument, options);
}
exports.useUserTotpRegistrationInitiateMutation = useUserTotpRegistrationInitiateMutation;
exports.UserTotpRegistrationValidateDocument = (0, client_1.gql) `
    mutation userTotpRegistrationValidate($input: UserTotpRegistrationValidateInput!) {
  userTotpRegistrationValidate(input: $input) {
    errors {
      message
    }
    me {
      totpEnabled
      phone
      email {
        address
        verified
      }
    }
  }
}
    `;
/**
 * __useUserTotpRegistrationValidateMutation__
 *
 * To run a mutation, you first call `useUserTotpRegistrationValidateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUserTotpRegistrationValidateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [userTotpRegistrationValidateMutation, { data, loading, error }] = useUserTotpRegistrationValidateMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useUserTotpRegistrationValidateMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.UserTotpRegistrationValidateDocument, options);
}
exports.useUserTotpRegistrationValidateMutation = useUserTotpRegistrationValidateMutation;
exports.DeviceNotificationTokenCreateDocument = (0, client_1.gql) `
    mutation deviceNotificationTokenCreate($input: DeviceNotificationTokenCreateInput!) {
  deviceNotificationTokenCreate(input: $input) {
    errors {
      message
    }
    success
  }
}
    `;
/**
 * __useDeviceNotificationTokenCreateMutation__
 *
 * To run a mutation, you first call `useDeviceNotificationTokenCreateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeviceNotificationTokenCreateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deviceNotificationTokenCreateMutation, { data, loading, error }] = useDeviceNotificationTokenCreateMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
function useDeviceNotificationTokenCreateMutation(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useMutation(exports.DeviceNotificationTokenCreateDocument, options);
}
exports.useDeviceNotificationTokenCreateMutation = useDeviceNotificationTokenCreateMutation;
exports.WalletsDocument = (0, client_1.gql) `
    query wallets {
  me {
    id
    defaultAccount {
      id
      wallets {
        walletCurrency
        id
        lnurlp
      }
    }
  }
}
    `;
/**
 * __useWalletsQuery__
 *
 * To run a query within a React component, call `useWalletsQuery` and pass it any options that fit your needs.
 * When your component renders, `useWalletsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useWalletsQuery({
 *   variables: {
 *   },
 * });
 */
function useWalletsQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useQuery(exports.WalletsDocument, options);
}
exports.useWalletsQuery = useWalletsQuery;
function useWalletsLazyQuery(baseOptions) {
    const options = Object.assign(Object.assign({}, defaultOptions), baseOptions);
    return Apollo.useLazyQuery(exports.WalletsDocument, options);
}
exports.useWalletsLazyQuery = useWalletsLazyQuery;
//# sourceMappingURL=generated.js.map