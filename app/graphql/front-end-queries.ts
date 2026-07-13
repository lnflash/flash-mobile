import { gql } from "@apollo/client"

gql`
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
  query homeAuthed {
    me {
      id
      language
      username
      phone
      createdAt
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
          isExternal
        }
      }
    }
  }

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

  query transactionListForDefaultAccount(
    $first: Int
    $after: String
    $last: Int
    $before: String
  ) {
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
          isExternal
        }
      }
    }
  }

  query conversionScreen {
    me {
      id
      defaultAccount {
        id
        wallets {
          id
          balance
          walletCurrency
          isExternal
        }
      }
    }
  }

  query cashoutScreen {
    me {
      id
      defaultAccount {
        id
        wallets {
          id
          balance
          walletCurrency
          isExternal
        }
      }
    }
  }

  query walletCSVTransactions($walletIds: [WalletId!]!) {
    me {
      id
      defaultAccount {
        id
        csvTransactions(walletIds: $walletIds)
      }
    }
  }

  query walletOverviewScreen {
    me {
      id
      defaultAccount {
        id
        wallets {
          id
          balance
          walletCurrency
          isExternal
        }
      }
    }
  }

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
          isExternal
        }
      }
      contacts {
        id
        username
      }
    }
  }

  query accountDefaultWallet($username: Username!) {
    accountDefaultWallet(username: $username) {
      id
      walletCurrency
    }
  }

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
          isExternal
        }
      }
    }
  }

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

  query sendBitcoinConfirmationScreen {
    me {
      id
      defaultAccount {
        id
        wallets {
          id
          balance
          walletCurrency
          isExternal
        }
      }
    }
  }

  query myUserId {
    me {
      id
    }
  }

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
          isExternal
        }
      }
      contacts {
        id
        username
      }
    }
  }

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
  query npubByUsername($username: Username!) {
    npubByUsername(username: $username) {
      npub
      username
    }
  }

  query LatestAccountUpgradeRequest {
    latestAccountUpgradeRequest {
      errors {
        code
        message
      }
      upgradeRequest {
        address {
          city
          country
          line1
          line2
          postalCode
          state
          title
        }
        bankAccount {
          accountName
          accountNumber
          accountType
          bankBranch
          bankName
          currency
          id
          isDefault
        }
        currentLevel
        fullName
        terminalsRequested
        status
        requestedLevel
        phoneNumber
        email
        idDocument
      }
    }
  }

  query SupportedBanks {
    supportedBanks {
      name
    }
  }

  query BridgeKycStatus {
    bridgeKycStatus
  }

  query BridgeVirtualAccount {
    bridgeVirtualAccount {
      accountNumber
      accountNumberLast4
      bankName
      id
      kycLink
      message
      pending
      routingNumber
      tosLink
    }
  }

  query BankAccounts {
    me {
      id
      bankAccounts {
        accountName
        accountNumber
        accountType
        bankBranch
        bankName
        currency
        id
        isDefault
        pendingUpdate {
          status
          bankName
          bankBranch
          accountType
          accountNumber
          currency
          rejectionReason
        }
      }
    }
  }

  query BridgeExternalAccounts {
    bridgeExternalAccounts {
      accountNumberLast4
      bankName
      id
      status
    }
  }

  query BridgeWithdrawalRequest($id: ID!) {
    bridgeWithdrawalRequest(id: $id) {
      amount
      createdAt
      currency
      externalAccountId
      failureReason
      id
      status
    }
  }

  query CashWalletCutover {
    cashWalletCutover {
      completedAt
      cutoverVersion
      pauseReason
      pausedAt
      runId
      scheduledAt
      startedAt
      state
      updatedAt
      updatedBy
    }
  }
`
