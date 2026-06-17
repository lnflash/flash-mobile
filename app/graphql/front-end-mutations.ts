import { gql } from "@apollo/client"

gql`
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

  mutation intraLedgerPaymentSend($input: IntraLedgerPaymentSendInput!) {
    intraLedgerPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation intraLedgerUsdPaymentSend($input: IntraLedgerUsdPaymentSendInput!) {
    intraLedgerUsdPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation lnNoAmountInvoicePaymentSend($input: LnNoAmountInvoicePaymentInput!) {
    lnNoAmountInvoicePaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation lnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
    lnInvoicePaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation lnNoAmountUsdInvoicePaymentSend($input: LnNoAmountUsdInvoicePaymentInput!) {
    lnNoAmountUsdInvoicePaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation onChainPaymentSend($input: OnChainPaymentSendInput!) {
    onChainPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation onChainPaymentSendAll($input: OnChainPaymentSendAllInput!) {
    onChainPaymentSendAll(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation onChainUsdPaymentSend($input: OnChainUsdPaymentSendInput!) {
    onChainUsdPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation onChainUsdPaymentSendAsBtcDenominated(
    $input: OnChainUsdPaymentSendAsBtcDenominatedInput!
  ) {
    onChainUsdPaymentSendAsBtcDenominated(input: $input) {
      errors {
        message
      }
      status
    }
  }

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

  mutation RequestCashout($input: RequestCashoutInput!) {
    requestCashout(input: $input) {
      errors {
        code
        message
      }
      offer {
        exchangeRate
        expiresAt
        flashFee
        offerId
        receiveJmd
        receiveUsd
        send
        walletId
      }
    }
  }

  mutation InitiateCashout($input: InitiateCashoutInput!) {
    initiateCashout(input: $input) {
      errors {
        code
        message
      }
      id
    }
  }

  mutation accountDelete {
    accountDelete {
      errors {
        message
      }
      success
    }
  }

  mutation lnUsdInvoiceAmount($input: LnUsdInvoiceFeeProbeInput!) {
    lnUsdInvoiceFeeProbe(input: $input) {
      errors {
        message
      }
      invoiceAmount
      amount
    }
  }

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

  mutation businessAccountUpgradeRequest($input: BusinessAccountUpgradeRequestInput!) {
    businessAccountUpgradeRequest(input: $input) {
      errors {
        message
        code
      }
      id
      status
    }
  }

  mutation IdDocumentUploadUrlGenerate($input: IdDocumentUploadUrlGenerateInput!) {
    idDocumentUploadUrlGenerate(input: $input) {
      errors {
        code
        message
      }
      fileKey
      uploadUrl
    }
  }

  mutation UpdateExternalWallet($input: UpdateExternalWalletInput!) {
    updateExternalWallet(input: $input) {
      errors {
        code
        message
      }
      walletId
    }
  }

  mutation BridgeInitiateKyc($input: BridgeInitiateKycInput!) {
    bridgeInitiateKyc(input: $input) {
      errors {
        code
        message
      }
      kycLink {
        kycLink
        tosLink
      }
    }
  }

  mutation BridgeAddExternalAccount {
    bridgeAddExternalAccount {
      externalAccount {
        expiresAt
        linkUrl
      }
      errors {
        code
        message
      }
    }
  }

  mutation BridgeRequestWithdrawal($input: BridgeRequestWithdrawalInput!) {
    bridgeRequestWithdrawal(input: $input) {
      withdrawal {
        amount
        createdAt
        bridgeTransferId
        currency
        externalAccountId
        failureReason
        id
        status
      }
      errors {
        code
        message
      }
    }
  }

  mutation BridgeInitiateWithdrawal($input: BridgeInitiateWithdrawalInput!) {
    bridgeInitiateWithdrawal(input: $input) {
      withdrawal {
        amount
        bridgeTransferId
        createdAt
        currency
        externalAccountId
        failureReason
        id
        status
      }
      errors {
        code
        message
      }
    }
  }

  mutation BridgeCancelWithdrawalRequest($input: BridgeCancelWithdrawalRequestInput!) {
    bridgeCancelWithdrawalRequest(input: $input) {
      withdrawal {
        amount
        createdAt
        currency
        externalAccountId
        failureReason
        id
        status
      }
      errors {
        code
        message
      }
    }
  }

  mutation BridgeCreateExternalAccount($input: BridgeCreateExternalAccountInput!) {
    bridgeCreateExternalAccount(input: $input) {
      externalAccount {
        id
        bankName
        accountNumberLast4
        status
      }
      errors {
        code
        message
      }
    }
  }
`
