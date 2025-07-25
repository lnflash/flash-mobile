// prettier-ignore

import { BaseTranslation } from "../i18n-types"

const en: BaseTranslation = {
  GaloyAddressScreen: {
    title: "Receive payment by using:",
    buttonTitle: "Set your address",
    yourLightningAddress: "Your Lightning address",
    yourAddress: "Your {bankName: string} address",
    notAbleToChange:
      "You won't be able to change your {bankName: string} address after it's set.",
    addressNotAvailable: "This {bankName: string} address is already taken.",
    somethingWentWrong: "Something went wrong. Please try again later.",
    merchantTitle: "For merchants",
    yourCashRegister: "Your Lightning Cash Register",
    yourPaycode: "Your Paycode",
    copiedLightningAddressToClipboard: "Copied Lightning address to clipboard",
    copiedAddressToClipboard: "Copied {bankName: string} address to clipboard",
    copiedPaycodeToClipboard: "Copied Paycode to clipboard",
    copiedCashRegisterLinkToClipboard: "Copied Cash Register Link to clipboard",
    howToUseIt: "How to use it?",
    howToUseYourAddress: "How to use a Lightning address",
    howToUseYourPaycode: "How to use your Paycode",
    howToUseYourCashRegister: "How to use your Cash Register",
    howToUseYourAddressExplainer:
      "Share with someone that has a compatible wallet, such as:",
    howToUseYourPaycodeExplainer:
      "You can print your Paycode (technically, this is an lnurl-pay address) and display it in your business to receive payments. Individuals can pay you by scanning it with a Lightning-enabled wallet.\n\nHowever, be aware that some wallets can’t scan a Paycode such as:",
    howToUseYourCashRegisterExplainer:
      "Allow people to collect payments via the Cash Register link, without accessing your wallet.\n\nThey can create invoices and payments will be sent directly to your {bankName: string} Wallet.",
  },
  SetAccountModal: {
    title: "Set default account",
    description:
      "This account will be initially selected for sending and receiving payments. It can be changed at any time.",
    stablesatsTag: "Choose this to maintain a stable USD value.",
    bitcoinTag: "Choose this to be on a Bitcoin standard.",
  },
  NoteInput: {
    addNote: "Add note...",
  },
  AuthenticationScreen: {
    authenticationDescription: "Authenticate to continue",
    setUp: "Set up Biometric Authentication",
    setUpAuthenticationDescription: "Use biometric to authenticate",
    skip: "Skip",
    unlock: "Unlock",
    usePin: "Use PIN",
  },
  ContactsScreen: {
    noContactsTitle: "No Contacts Found",
    noContactsYet:
      "Send or receive a payment using a username and contacts will automatically be added here",
    noMatchingContacts: "No contacts matching your search were found.",
    title: "Contacts",
  },
  ContactDetailsScreen: {
    title: "Transactions with {username: string}",
  },
  ChatScreen: {
    noChatsTitle: "No Chats Found",
    noChatsYet:
      "Enter a Flash username or \nnostr pubkey to start a chat",
    noMatchingChats: "No chats matching your search were found.",
    title: "Chat",
  },
  ChatDetailsScreen: {
    title: "Chat with {username: string}",
  },
  CardScreen: {
    noCardsTitle: "No Cards Found",
    noCardsYet:
      "Tap a Flashcard to add it here",
    noMatchingCards: "No Cards matching your search were found.",
    title: "Flashcard",
    notFlashcard: "Unsupported NFC card. Please ensure you are using a flashcard.",
    noNDEFMessage: "NDEF message not found. Please ensure you are using a flashcard.",
    notSupported: "NFC is not supported on this device.",
    notEnabled: "NFC is not enabled on this device.",
    noTag: "No tag found. Please ensure you are using a flashcard."
  },
  Cashout: {
    title: "Settle",
    percentageToCashout: "% to settle",
    valid: "Valid for {time: string}",
    exchangeRate: "Exchange Rate",
    sendAmount: "Send Amount",
    receiveAmount: "Receive Amount",
    fee: "Fee",
    success: "Settlement request initiated successfully.",
    disclaimer: `Please Note: Bank transfers are usually confirmed on the same-day, but may take longer if submitted during the following times:\n\n- Weekdays after 2:00pm\n- Fridays & weekends\n\nTransactions completed  after 2:00 pm on weekdays are not confirmed by the bank until the following business day. Please contact us if you do not see your funds within 2-3 business days.\n`
  },
  ConversionDetailsScreen: {
    title: "Swap",
    percentageToConvert: "% to convert",
  },
  ConversionConfirmationScreen: {
    title: "Review conversion",
    youreConverting: "You're converting",
    sendingAccount: "Sending account",
    receivingAccount: "Receiving account",
    conversionFee: "Conversion Fee"
  },
  ConversionSuccessScreen: {
    title: "Conversion Success",
    message: "Conversion successful",
  },
  EarnScreen: {
    earnSats: "Earn {formattedNumber|sats}",
    earnSections: {
      bitcoinWhatIsIt: {
        title: "Bitcoin: What is it?",
        questions: {
          whatIsBitcoin: {
            answers: ["Digital money", "A video game", "A new cartoon character"],
            feedback: [
              "Correct. You just earned 1 “sat”!",
              "Incorrect, please try again.",
              "Nope. At least not one that we know of!",
            ],
            question: "So what exactly is Bitcoin?",
            text:
              "Bitcoin is digital money. \n\nIt can be transferred instantly and securely between any two people in the world — without the need for a bank or any other financial company in the middle.",
            title: "So what exactly is Bitcoin?",
          },
          sat: {
            answers: [
              "The smallest unit of Bitcoin",
              "A small satellite",
              "A space cat 🐱🚀",
            ],
            feedback: [
              "Correct. You just earned another two sats!!",
              "Maybe… but that is not the correct answer in this context 🙂",
              "Ummm.... not quite!",
            ],
            question: 'I just earned a “Sat". What is that?',
            text:
              "One “Sat” is the smallest unit of a bitcoin. \n\nWe all know that one US Dollar can be divided into 100 cents. Similarly, one Bitcoin can be divided into 100,000,000 sats. \n\nIn fact, you do not need to own one whole bitcoin in order to use it. You can use bitcoin whether you have 20 sats, 3000 sats — or 100,000,000 sats (which you now know is equal to one bitcoin).",
            title: 'I just earned a “Sat". What is that?',
          },
          whereBitcoinExist: {
            answers: ["On the Internet", "On the moon", "In a Federal bank account"],
            feedback: [
              "Correct. You just earned another 5 sats.",
              "Incorrect. Well… at least not yet ;)",
              "Wrong. Please try again.",
            ],
            question: "Where do the bitcoins exist?",
            text:
              "Bitcoin is a new form of money. It can be used by anyone, anytime -- anywhere in the world. \n\nIt is not tied to a specific government or region (like US Dollars). There are also no paper bills, metal coins or plastic cards. \n\nEverything is 100% digital. Bitcoin is a network of computers running on the internet. \n\nYour bitcoin is easily managed with software on your smartphone or computer!",
            title: "Where do the bitcoins exist?",
          },
          whoControlsBitcoin: {
            answers: [
              "A voluntary community of users around the world",
              "Mr Burns from The Simpsons",
              "The government of France",
            ],
            feedback: [
              "That is right. Bitcoin is made possible by people all around the world running bitcoin software on their computers and smartphones.",
              "An amusing thought — but not correct!",
              "Wrong. There is no company nor government that controls Bitcoin.",
            ],
            question: "Who controls Bitcoin?",
            text:
              "Bitcoin is not controlled by any person, company or government. \n\nIt is run by the community of users -- people and companies all around the world -- voluntarily running bitcoin software on their computers and smartphones.",
            title: "Who controls Bitcoin?",
          },
          copyBitcoin: {
            answers: [
              "No — it is impossible to copy or duplicate the value of bitcoin",
              "Yes, you can copy bitcoins just as easily as copying a digital photo",
              "Yes, but copying bitcoin requires very specialized computers",
            ],
            feedback: [
              "That is absolutely correct!",
              "You know that it is not true. Try again.",
              "Incorrect. There is no way for anyone to copy, or create a duplicate, of bitcoin.",
            ],
            question:
              "If Bitcoin is digital money, can’t someone just copy it — and create free money?",
            text:
              "The value of a bitcoin can never be copied. This is the very reason why Bitcoin is such a powerful new invention!!\n\nMost digital files — such as an iPhone photo, an MP3 song, or a Microsoft Word document — can easily be duplicated and shared. \n\nThe Bitcoin software uniquely prevents the duplication — or “double spending” — of digital money. We will share exactly how this works later on!",
            title:
              "If Bitcoin is digital money, can’t someone just copy it — and create free money?",
          },
        },
      },
      WhatIsMoney: {
        title: "What is Money? ",
        questions: {
          moneySocialAggrement: {
            answers: [
              "Because people trust that other people will value money similarly",
              "Because your mother told you so",
              "Because a dollar bill is worth its weight in gold",
            ],
            feedback: [
              "Correct. This is what allows money to work!",
              "She may well have. But that is not the correct answer here!",
              "Nope. In the past you could exchange US dollars for gold. But this is no longer the case.",
            ],
            question: "Why does money have value?",
            text:
              "Money requires people to trust. \n\nPeople trust the paper dollar bills in their pocket. They trust the digits in their online bank account. They trust the balance on a store gift card will be redeemable. \n\nHaving money allows people to easy trade it immediately for a good, or a service.",
            title: "Money is a social agreement.",
          },
          coincidenceOfWants: {
            answers: [
              "Coincidence of wants",
              "Coincidence of day and night",
              "Coincidence of the moon blocking the sun",
            ],
            feedback: [
              "That is right. Money allows you to easily purchase something, without haggling about the form of payment",
              "No silly, you know that is not the answer.",
              "Not quite. We call that a solar eclipse 🌚",
            ],
            question: "Which coincidence does money solve?",
            text:
              "Centuries ago, before people had money, they would barter -- or haggle over how to trade one unique item, in exchange for another item or service. \n\nLet’s say you wanted to have a meal at the local restaurant, and offered the owner a broom. The owner might say “no” -- but I will accept three hats instead, if you happen to have them. \n\nYou can imagine how difficult and inefficient a “barter economy” would be !  \n\nBy contrast, with money, you can simply present a $20 bill. And you know that the restaurant owner will readily accept it.",
            title: "Money solves the “coincidence of wants”...  What is that??",
          },
          moneyEvolution: {
            answers: [
              "Stones, seashells and gold",
              "Tiny plastic Monopoly board game houses",
              "Coins made of chocolate",
            ],
            feedback: [
              "Correct. Items that are rare and difficult to copy have often been used as money.",
              "Wrong. They may have value when playing a game -- but not in the real word!",
              "Nope. They may be tasty. But they are not useful as money.",
            ],
            question:
              "What are some items that have been historically used as a unit of money?",
            text:
              "Thousands of years ago, society in Micronesia used very large and scarce stones as a form of agreed currency. \n\nStarting in the 1500’s, rare Cowrie shells (found in the ocean) became commonly used in many nations as a form of money.\n\nAnd for millennia, gold has been used as a form of money for countries around the world -- including the United States (until 1971).",
            title: "Money has evolved, since almost the beginning of time.",
          },
          whyStonesShellGold: {
            answers: [
              "Because they have key characteristics -- such as being durable, uniform and divisible.",
              "Because they are pretty and shiny.",
              "Because they fit inside of your pocket",
            ],
            feedback: [
              "Correct. More key characteristics include being scarce and portable.",
              "Incorrect. That may be true, but alone are not great characteristics of money.",
              "Not quite. Although these items were surely portable, that alone was not the reason to be used as money.",
            ],
            question: "Why were stones, seashells and gold used as units of money?",
            text:
              "Well, these items all had some -- but not all -- of the characteristics of good money. \n\nSo what characteristics make for “good” money? \nScarce: not abundant, nor easy to reproduce or copy \nAccepted: relatively easy for people to verify its authenticity \nDurable: easy to maintain, and does not perish or fall apart\nUniform: readily interchangeable with another item of the same form\nPortable: easy to transport\nDivisible: can be split and shared in smaller pieces",
            title: "Why were stones, shells and gold commonly used as money in the past?",
          },
          moneyIsImportant: {
            answers: [
              "Money allows people to buy goods and services today -- and tomorrow.",
              "Money allows you to go to the moon.",
              "Money is the solution to all problems.",
            ],
            feedback: [
              "That is right!",
              "Incorrect. Although that may change in the future ;)",
              "Not quite. Although some people may believe such, this answer does not address the primary purpose of money.",
            ],
            question: "What is the primary reason money is important?",
            text:
              "Everybody knows that money matters.\n\nMost people exchange their time and energy -- in the form of work -- to obtain money. People do so, to be able to buy goods and services today -- and in the future.",
            title: "Money is important to individuals",
          },
          moneyImportantGovernement: {
            answers: [
              "The US Central Bank (The Federal Reserve)",
              "Mr Burns from The Simpsons",
              "A guy with a printing press in his basement",
            ],
            feedback: [
              "Correct. The US Government can print as much money as they want at any time.",
              "Incorrect. Although it did seem like he always had a lot of money.",
              "No. Whilst some people do create fake dollar bills, it is definitely not legal!",
            ],
            question: "Who can legally print US Dollars, anytime they wish?",
            text:
              "Modern-day economies are organized by nation-states: USA, Japan, Switzerland, Brazil, Norway, China, etc. \n\nAccordingly, in most every nation, the government holds the power to issue and control money. \n\nIn the United States, the Central Bank (known as the Federal Reserve, or “Fed”) can print, or create, more US Dollars at any time it wants. \n\nThe “Fed” does not need permission from the President, nor Congress, and certainly not from US citizens.  \n\nImagine if you had the ability to print US Dollars anytime you wanted to -- what would you do??",
            title: "Money is also important to governments",
          },
        },
      },
      HowDoesMoneyWork: {
        title: "How Does Money Work? ",
        questions: {
          WhatIsFiat: {
            answers: [
              "It is created by order of the National government in a given country.",
              "By the manager of the local branch bank.",
              "The Monopoly Money Man.",
            ],
            feedback: [
              "Correct. The central bank of a government creates fiat money.",
              "Incorrect. A local bank can only manage money that has been previously created by the government.",
              "Nope. Try again!",
            ],
            question: "Who creates fiat money, such as US Dollars or Swiss Francs?",
            text:
              "All national currencies in circulation today are called “fiat” money. This includes US Dollars, Japanese Yen, Swiss Francs, and so forth. \n\nThe word “fiat” is latin for “by decree” -- which means “by official order”. \n\nThis means that all fiat money -- including the US Dollar -- is simply created by the order of the national government.",
            title: "Fiat Currency: What is that?",
          },
          whyCareAboutFiatMoney: {
            answers: [
              "All fiat currency is eventually abused by government authorities.",
              "Local banks might not have enough vault space to hold all of the dollar bills.",
              "There might not be enough trees to make paper for all of the additional dollar bills.",
            ],
            feedback: [
              "Correct. Throughout history, governments have been unable to resist the ability to print money, as they effectively have no obligation to repay this money.",
              "Nope, that is certainly not the case.",
              "Wrong. Please try again.",
            ],
            question: "Why should I care about the government controlling fiat money?",
            text:
              "As shared in a prior quiz, the US Central Bank is the Federal Reserve, or the “Fed”.\n\nThe Fed can print more dollars at any time -- and does not need permission from the President, nor Congress, and certainly not from US citizens.  \n\nHaving control of money can be very tempting for authorities to abuse -- and often time leads to massive inflation, arbitrary confiscation and corruption. \n\nIn fact, Alan Greenspan, the famous former chairman of The Fed, famously said the US “can pay any debt that it has, because we can always print more to do that”.",
            title: "I trust my government. \nWhy should I care about fiat money?",
          },
          GovernementCanPrintMoney: {
            answers: [
              "The printing of additional money leads to inflation.",
              "People must exchange old dollar bills at the bank every year.",
              "The appearance of the dollar bill changes.",
            ],
            feedback: [
              "Correct. This means that goods and services will cost more in the future.",
              "Nope. Older dollar bills are just as valid as newer ones.",
              "Incorrect. Although the government may issue new looks for bills, this has nothing to do with increasing the money supply.",
            ],
            question: "What does it mean when the government prints money?",
            text:
              "Well, everybody should care! \n\nThe practice of government printing money -- or increasing the supply of dollars -- leads to inflation.\n\nInflation is an increase in the price of goods and services. In other words, the price for something in the future will be more expensive than today.\n\nSo what does inflation mean for citizens? \n\nIn the United Kingdom, the Pound Sterling has lost 99.5% of its value since being introduced over 300 years ago. \n\nIn the United States, the dollar has lost 97% of its value since the end of WWI, about 100 years ago. \n\nThis means a steak that cost $0.30 in 1920... was $3 in 1990… and about $15 today, in the year 2020!",
            title: "Who should care that the government can print unlimited money?",
          },
          FiatLosesValueOverTime: {
            answers: [
              "Every fiat currency that ever existed has lost a massive amount of value.",
              "The value stays the same forever.",
              "The look and design of paper bills is updated every 10 years or so.",
            ],
            feedback: [
              "Correct. This is true even for USD, which has lost 97% of its value during the last 100 years.",
              "Incorrect. Please try again.",
              "Not quite. Although the design of papers bills may change, this has nothing to do with their value.",
            ],
            question: "What happens to the value of all fiat money over time?",
            text:
              "That is correct. \n\nIn the history of the world, there have been 775 fiat currencies created. Most no longer exist, and the average life for any fiat money is only 27 years.\n\nThe British Pound is the oldest fiat currency. It has lost more than 99% of its value since 1694. \n\nThere is no precedent for any fiat money maintaining its value over time. This is inflation. \nIt is effectively a form of theft of your own hard earned money !",
            title: "Does this mean that all fiat money loses value over time?",
          },
          OtherIssues: {
            answers: [
              "Money is difficult to move around the world, and can also be surveilled.",
              "Money is no longer needed in the 21st Century.",
              "Money is the root of all evil.",
            ],
            feedback: [
              "Correct. We will explain more about these issues in subsequent quiz modules. Keep digging!!",
              "Wrong answer. You know that is not true.",
              "While some may believe this to be so, it is not the answer we are looking for here.",
            ],
            question: "What are some other issues that exist with fiat money?",
            text:
              "Yes, there are many other issues that exist with modern fiat money. \n\nFirst, it can be extremely difficult to move money around the world. Often, governments will outright restrict the movement -- and sometimes even confiscate money -- without a valid reason or explanation. And even when you can send money, high transaction fees make it very expensive.\n\nSecond, even in the US, there has been a complete loss of privacy, as the majority of commerce takes places with debit and credit cards, as well as online with other systems such as PayPal and Apple Pay.\n\nEver notice how an ad appears in your social media or Gmail just moments after searching for a certain product or service? This is known as “surveillance capitalism”, and is based on companies selling your personal financial data.",
            title: "OK, fiat money loses value over time. Are there other issues?",
          },
        },
      },
      BitcoinWhySpecial: {
        title: "Bitcoin: Why is it special? ",
        questions: {
          LimitedSupply: {
            answers: [
              "Yes. There can never be more than 21 million bitcoin created.",
              "No. The government can create more bitcoin at any time.",
              "No, the bitcoin software can be changed to allow more bitcoins to be created.",
            ],
            feedback: [
              "Correct. By limiting the amount that can be created, Bitcoin is designed to increase in value over time.",
              "Wrong answer. The government has no control over Bitcoin.",
              "Incorrect. One of the key attributes of bitcoin is that the supply is limited forever.",
            ],
            question: "Is the supply of bitcoin limited forever?",
            text:
              "Governments can print fiat money in unlimited quantities. \n\nBy way of contrast, the supply of Bitcoin is fixed — and can never exceed 21 million coins. \n\nA continually increasing supply of fiat money creates inflation. This means that the money you hold today is less valuable in the future. \n\nOne simple example: \nA loaf of bread that cost about 8 cents in 1920. In the year 1990 one loaf cost about $1.00, and today the price is closer to $2.50 ! \n\nThe limited supply of bitcoin has the opposite effect, one of deflation. \n\nThis means that the bitcoin you hold today is designed to be more valuable in the future — because it is scarce.",
            title: "Special Characteristic #1:\nLimited Supply",
          },
          Decentralized: {
            answers: [
              "No. Bitcoin is completely “decentralized”.",
              "Yes. It is centrally controlled by the United Nations.",
              "Yes. It is centrally controlled by the world’s largest banks.",
            ],
            feedback: [
              "That is correct. There is no company, government or institution that controls bitcoin. Anyone can use bitcoin — all need is a smartphone and an internet connection.",
              "Wrong answer. Please try again.",
              "Incorrect. You already know this is not true!",
            ],
            question: "Is bitcoin centralized?",
            text:
              "Fiat money is controlled by banks and governments — which is why people refer to it as a “centralized” currency.\n\nBitcoin is not controlled by any person, government or company — which makes it “decentralized” \n\nNot having banks involved means that nobody can deny you access to bitcoin — because of race, gender, income, credit history, geographical location — or any other factor. \n\nAnybody — anywhere in the world — can access and use Bitcoin anytime you want. All you need is a computer or smartphone, and an internet connection!",
            title: "Special Characteristic #2: Decentralized",
          },
          NoCounterfeitMoney: {
            answers: [
              "No. It is impossible to counterfeit Bitcoin.",
              "Yes. Although creating fake bitcoin requires very specialized computers.",
              "Yes. The government can print as much bitcoin as it likes.",
            ],
            feedback: [
              "That is the right answer. In a subsequent quiz, Honey Badger will explain details as to why this is so!",
              "Incorrect. There is no way for anyone to copy or duplicate the value of a bitcoin.",
              "Wrong. Although the government can print unlimited dollars, it can not print bitcoin.",
            ],
            question: "Can people counterfeit Bitcoin?",
            text:
              "Paper money, checks and credit card transactions can all be counterfeit, or faked. \n\nThe unique software that runs the Bitcoin network eliminates the possibility of duplicating money for counterfeit purposes.  \n\nNew bitcoin can only be issued if there is agreement amongst the participants in the network. People who are voluntarily running bitcoin software on their own computers and smartphones.\n\nThis ensures that it is impossible to counterfeit, or create fake bitcoins.",
            title: "Special Characteristic #3: \nNo Counterfeit Money",
          },
          HighlyDivisible: {
            answers: [
              "0.00000001 BTC",
              "One whole bitcoin. It is not possible to use anything less.",
              "0.01 BTC",
            ],
            feedback: [
              "Yes. You can divide a bitcoin into 100,000,000 pieces. As you already know, the smallest unit of bitcoin — B0.00000001 — is known as a “sat”.",
              "Wrong. Bitcoin is highly divisible. You can easily use a very small fraction of a bitcoin.",
              "Incorrect. Although the smallest unit of US currency is one penny, a bitcoin is divisible by much more than 100x.",
            ],
            question: "What is the smallest amount of Bitcoin one can own, or use?",
            text:
              'Old-fashioned fiat money can only be spent in amounts as small as one penny — or two decimal places for one US Dollar ($0.01).\n\nOn the other hand, Bitcoin can be divided 100,000,000 times over. This means that you could spend as little as ₿0.00000001. You will note the "₿" symbol, which is the Bitcoin equivalent of "$". Sometimes you will also see the use of BTC, instead of ₿.\n\nBy way of contrast, Bitcoin can handle very small payments — even those less than one US penny!',
            title: "Special Characteristic #4: \nHighly Divisible",
          },
          securePartOne: {
            answers: [
              "Yes. The bitcoin network is very secure.",
              "Maybe. It depends on the day of the week.",
              "No. It is open source software, and is easily attacked.",
            ],
            feedback: [
              "Correct. In fact, the Bitcoin network has never once been hacked. Answer the next question to learn more!",
              "Nice try, but wrong. The bitcoin network is safe and secure — 24 hours a day, 365 days a year.",
              "Icorrect. Although bitcoin is indeed “open source” software — or available to the public for free — is still extremely secure.",
            ],
            question: "Is the Bitcoin network secure?",
            text:
              "The bitcoin network is worth well over $100 billion today. Accordingly, the network must be very secure — so that money is never stolen. \n\nBitcoin is known as the world’s first cryptocurrency. \n\nThe “crypto” part of the name comes from cryptography. Simply put, cryptography protects information through very complex math functions. \n\nMost people do not realize — but Bitcoin is actually the most secure computer network in the world ! \n\n(you may have heard about bitcoin “hacks” — which we will debunk in the next quiz)",
            title: "Special Characteristic #5: \nSecure -- Part I",
          },
          securePartTwo: {
            answers: [
              "No. Bitcoin has never been hacked.",
              "Yes. Bitcoin gets hacked frequently.",
              "Yes. Bitcoin usually gets hacked on holidays, when traditional banks are closed.",
            ],
            feedback: [
              "That is correct. The bitcoin network has never been compromised. However, it is important to use only secure digital wallets to keep your personal bitcoins safe at all times.",
              "Wrong. Please try again.",
              "No silly, you know that is not the correct answer.",
            ],
            question: "Has Bitcoin ever been hacked?",
            text:
              "To be direct: the bitcoin network itself has never been hacked. Never once.\n\nThen what exactly has been hacked? \n\nCertain digital wallets that did not have proper security in place. \n\nJust like a physical wallet holds fiat currency (in the form of paper bills), digital wallets hold some amount of bitcoin. \n\nIn the physical world, criminals rob banks — and walk away with US Dollars. The fact that someone robbed a bank does not have any relationship as to whether the US Dollar is stable or reliable money. \n\nSimilarly, some computer hackers have stolen bitcoin from insecure digital wallets — the online equivalent of a bank robbery. \n\nHowever, it is important to know that the bitcoin network has never been hacked or compromised !",
            title: "Special Characteristic #5: \nSecure -- Part II",
          },
        },
      },
    },
    finishText: "That's all for now, we'll let you know when there's more to unearth",
    getRewardNow: "Answer quiz",
    keepDigging: "Keep digging!",
    phoneNumberNeeded: "Phone number required",
    quizComplete: "Quiz completed and {amount: number} sats earned",
    reviewQuiz: "Review quiz",
    satAccumulated: "Sats accumulated",
    satsEarned: "{formattedNumber|sats} earned",
    sectionsCompleted: "You've completed",
    title: "Earn",
    unlockQuestion: "To unlock, answer the question:",
    youEarned: "You Earned",
    registerTitle: "Need to upgrade your account",
    registerContent: "Register with your phone number to receive sats",
  },
  GetStartedScreen: {
    logInCreateAccount: "Log in / create account",
    quickStart: "Start",
    restoreWallet: "Login",
    exploreWalletInstead: "Explore wallet instead",
    setupBusinessAccount: "Setup business account",
    createAccount: "Create new account",
    exploreWallet: "Explore wallet",
    logBackInWith: "Log back in with",
    headline: "Product of Jamaica",
    startTrialAccount: "Start with a trial account",
    startWithTrialAccount: "Start with trial account",
    registerPhoneAccount: "Register phone account",
    trialAccountCreationFailed: "Account creation temporarily unavailable",
    trialAccountCreationFailedMessage:
      "Unfortunately, we were unable to create your account. Try again later, please.",
    trialAccountHasLimits: "Trial account has limits",
    trialAccountLimits: {
      noBackup: "No backup option",
      sendingLimit: "Reduced daily sending limit",
      noOnchain: "No receiving bitcoin onchain",
    },
    chooseAccountType:"Choose Account Type",
  },
  MapScreen: {
    locationPermissionMessage:
      "Activate your location so you know where you are on the map",
    locationPermissionNegative: "Cancel",
    locationPermissionNeutral: "Ask Me Later",
    locationPermissionPositive: "OK",
    locationPermissionTitle: "Locate yourself on the map",
    payBusiness: "Pay this Business",
    title: "Map",
    addPin: "Click anywhere to add a pin",
    selectedCoordinates: "Your Flashpoint Coordinates: \n",
    viewInGoogleMaps: "View in Google Maps",
    getDirections: "Get Directions",
  },
  HomeScreen: {
    cashout: "Cash Out",
    receive: "Receive",
    reload: "Reload Card",
    balance: "Refresh Balance",
    showQrCode: "Topup via QR",
    send: "Send",
    sweep: "Sweep to Wallet",
    pay: "Pay",
    title: "Home",
    scan: "Scan QR",
    updateAvailable: "An update is available.\nTap to update now",
    useLightning: "We use the Lightning Network.",
    myAccounts: "My Accounts",
    refundableWarning: "Please complete or refund all pending transactions before uninstalling Flash or pending funds will be lost.",
    refundables: "Refundables",
		cash: "Cash",
		bitcoin: "Bitcoin",
		flashcard: "Flashcard",
		addFlashcard: "Add Flashcard",
    upgradeTitle: "Add your phone number",
    upgradeDesc: "Backup your cash wallet and increase transaction limits.",
    currencyTitle:"Change to your local currency",
    currencyDesc: "Review our available currency list and select your currency.",
    flashcardTitle: "Get a Flashcard",
    flashcardDesc: "Find a Flashpoint and get a Flashcard to use in daily life.",
    nonCustodialWalletTitle: "Non-custodial wallets",
    nonCustodialWalletDesc: "Learn more about non-custodial wallets.",
    emailTitle: "Email address",
    emailDesc: "Add your email address to secure your account and login using email address.",
    btcWalletTitle: "Enable BTC wallet",
    btcWalletDesc: "Easily transfer larger amounts in Bitcoin.",
    backupTitle: "Backup your BTC wallet",
    backupDesc: "Backup and secure your Bitcoin wallet using recovery phrase."
  },
  PinScreen: {
    attemptsRemaining: "Incorrect PIN. {attemptsRemaining: number} attempts remaining.",
    oneAttemptRemaining: "Incorrect PIN. 1 attempt remaining.",
    setPin: "Set your PIN code",
    setPinFailedMatch: "Pins didn't match - Set your PIN code",
    storePinFailed: "Unable to store your pin.",
    tooManyAttempts: "Too many failed attempts. Logging out.",
    verifyPin: "Verify your PIN code",
  },
  PriceHistoryScreen: {
    oneDay: "1D",
    oneMonth: "1M",
    oneWeek: "1W",
    oneYear: "1Y",
    fiveYears: "5Y",
    satPrice: "Price for 100,000 sats: ",
    last24Hours: "last 24 hours",
    lastWeek: "last week",
    lastMonth: "last month",
    lastYear: "last year",
    lastFiveYears: "last five years",
  },
  PrimaryScreen: {
    title: "Home",
  },
  ReceiveScreen: {
    flashcardInstructions: "Top up your Flashcard here! \n\nScan the QR code, or tap the icon to share this on whatsapp, email, etc.",
    nfc: "NFC",
    enterAmountFirst: "Please enter an amount first",
    activateNotifications:
      "Do you want to activate notifications to be notified when the payment has arrived?",
    copyClipboard: "Invoice has been copied in the clipboard",
    copyClipboardBitcoin: "Bitcoin address has been copied in the clipboard",
    copyClipboardPaycode: "Paycode/LNURL has been copied in the clipboard",
    invoicePaid: "This invoice has been paid",
    setNote: "set a note",
    tapQrCodeCopy: "Tap QR Code to Copy",
    title: "Receive Bitcoin",
    usdTitle: "Receive USD",
    error: "Failed to generate invoice. Please contact support if this problem persists.",
    copyInvoice: "Copy",
    shareInvoice: "Share",
    addAmount: "Request Specific Amount",
    expired: "The invoice has expired",
    expiresIn: "Expires in",
    updateInvoice: "Update Invoice",
    flexibleAmountInvoice: "Flexible Amount Invoice",
    copyAddress: "Copy Address",
    shareAddress: "Share Address",
    generatingInvoice: "Generating Invoice",
    regenerateInvoice: "Regenerate Invoice",
    useABitcoinOnchainAddress: "Use a Bitcoin onchain address",
    useALightningInvoice: "Use a Lightning Invoice",
    setANote: "Set a Note",
    invoiceAmount: "Invoice Amount",
    fees:
      "{minBankFee: string} sats fees for onchain payment below {minBankFeeThreshold: string} sats",
    lightning: "Lightning",
    paycode: "Paycode",
    onchain: "Onchain",
    bitcoin: "Bitcoin",
    stablesats: "Cash",
    regenerateInvoiceButtonTitle: "Regenerate Invoice",
    setUsernameButtonTitle: "Set Username",
    invoiceHasExpired: "Invoice has expired",
    setUsernameToAcceptViaPaycode:
      "Set your username to accept via Paycode QR (LNURL) and Lightning Address",
    singleUse: "Single Use",
    invoiceExpired: "Expired Invoice",
    invoiceValidity: {
      validFor1Day: "Valid for 1 day",
      validForNext: "Valid for next {duration: string}",
      validBefore: "Valid before {time: string}",
      expiresIn: "Expires in {duration: string}",
      expiresNow: "Expires now",
    },
    invoiceHasBeenPaid: "Invoice has been paid",
    yourBitcoinOnChainAddress: "Your Bitcoin Onchain Address",
    receive: "Receive",
    receiveViaInvoice: "Receive via Lightning",
    receiveViaPaycode: "Receive via Paycode",
    topupFlashcard: "Topup Flashcard",
    receiveViaOnchain: "Receive via Onchain",
    payCodeOrLNURL: "Paycode / LNURL",
    initialDeposit: "* Initial deposit of $5 recommended for channel setup. ~$1 will be paid as setup fee.",
    selectPaymentMethod: "Select Payment Method",
    selectWallet: "Select Wallet"
  },
  RedeemBitcoinScreen: {
    title: "Redeem Bitcoin",
    usdTitle: "Redeem for USD",
    error: "Failed to generate invoice. Please contact support if this problem persists.",
    redeemingError:
      "Failed to redeem Bitcoin. Please contact support if this problem persists.",
    submissionError:
      "Failed to submit withdrawal request. Please contact support if this problem persists.",
    minMaxRange: "Min: {minimumAmount: string}, Max: {maximumAmount: string}",
    redeemBitcoin: "Redeem Bitcoin",
    amountToRedeemFrom: "Amount to redeem from {domain: string}",
    redeemAmountFrom: "Redeem {amountToRedeem: string} from {domain: string}",
  },
  ScanningQRCodeScreen: {
    invalidContent:
      "We found:\n\n{found: string}\n\nThis is not a valid Bitcoin address or Lightning invoice",
    expiredContent: "We found:\n\n{found: string}\n\nThis invoice has expired",
    invalidTitle: "Invalid QR Code",
    noQrCode: "We could not find a QR code in the image",
    title: "Scan QR",
    permissionCamera: "We need permission to use your camera",
    noCamera: "No camera found",
    openSettings: "Open Settings",
    unableToOpenSettings: "Unable to open settings",
    invalidContentLnurl: "We found:\n\n{found: string}\n\n is not currently supported",
    imageLibraryPermissionsNotGranted: "We don't have permissions to access the image library.  Please check app settings for your platform.",
  },
  SecurityScreen: {
    biometricDescription: "Unlock with fingerprint or facial recognition.",
    biometricTitle: "Biometric",
    biometryNotAvailable: "Biometric sensor is not available.",
    biometryNotEnrolled:
      "Please register at least one biometric sensor in order to use biometric based authentication.",
    hideBalanceDescription:
      "Hides your balance on the home screen by default, so you don't reveal it to anyone looking at your screen.",
    hideBalanceTitle: "Hide Balance",
    pinDescription:
      "PIN is used as the backup authentication method for biometric authentication.",
    pinTitle: "PIN Code",
    setPin: "Set PIN",
    backupDescription: "To set a PIN code, please back up your account by adding a phone number."
  },
  SendBitcoinConfirmationScreen: {
    amountLabel: "Amount:",
    confirmPayment: "Confirm payment",
    confirmPaymentQuestion: "Do you want to confirm this payment?",
    destinationLabel: "To:",
    feeLabel: "Fee",
    memoLabel: "Note:",
    paymentFinal: "Payments are final.",
    stalePrice:
      "Your bitcoin price is old and was last updated {timePeriod} ago. Please restart the app before making a payment.",
    title: "Confirm Payment",
    totalLabel: "Total:",
    totalExceed: "Total exceeds your balance of {balance: string}",
    maxFeeSelected:
      "This is the maximum fee you will be charged for this transaction.  It may end up being less once the payment has been made.",
    feeError: "Failed to calculate fee",
    breezFeeText: "There may be a small fee for routing"
  },
  SendBitcoinDestinationScreen: {
    usernameNowAddress:
      "{bankName: string} usernames are now {bankName: string} addresses.",
    usernameNowAddressInfo:
      'When you enter a {bankName: string} username, we will add "@{lnDomain: string}" to it (e.g maria@{lnDomain: string}) to make it an address. Your username is now a {bankName: string} address too.\n\nGo to your {bankName: string} address page from your Settings to learn how to use it or to share it to receive payments.',
    enterValidDestination: "Please enter a valid destination",
    destinationOptions:
      "You can send to a {bankName: string} address, LN address, LN invoice, or BTC address.",
    expiredInvoice: "This invoice has expired. Please generate a new invoice.",
    wrongNetwork:
      "This invoice is for a different network. Please generate a new invoice.",
    invalidAmount:
      "This contains an invalid amount. Please regenerate with a valid amount.",
    usernameDoesNotExist:
      "{lnAddress: string} doesn't seem to be a {bankName: string} address that exists.",
    usernameDoesNotExistAdvice:
      "Either make sure the spelling is right or ask the recipient for an LN invoice or BTC address instead.",
    selfPaymentError: "{lnAddress: string} is your {bankName: string} address.",
    selfPaymentAdvice:
      "If you want to send money to another account that you own, you can use an invoice, LN or BTC address instead.",
    lnAddressError:
      "We can't reach this Lightning address. If you are sure it exists, you can try again later.",
    lnAddressAdvice:
      "Either make sure the spelling is right or ask the recipient for an invoice or BTC address instead.",
    unknownLightning: "We can't parse this Lightning address. Please try again.",
    unknownOnchain: "We can't parse this Bitcoin address. Please try again.",
    newBankAddressUsername:
      "{lnAddress: string} exists as a {bankName: string} address, but you've never sent money to it.",
    confirmModal: {
      title: "You've never sent money to this address",
      body1: "Please make sure the recipient gave you a {bankName: string} address,",
      bold2bold: "not a username from another wallet.",
      body3:
        "Otherwise, the money will go to a {bankName: string} Account that has the “{lnAddress: string}” address.\n\nCheck the spelling of the first part of the address as well. e.g. jackie and jack1e are 2 different addresses",
      warning:
        "If the {bankName: string} address is entered incorrectly, {bankName: string} can't undo the transaction.",
      checkBox: "{lnAddress: string} is the right address.",
      confirmButton: "I'm 100% sure",
    },
    clipboardError: "Error getting value from clipboard",
  },
  SendBitcoinScreen: {
    amount: "Amount",
    MinOnChainLimit: "Minimum amount for this transaction is US$2.00",
    MinOnChainSatLimit: "Minimum amount for this transaction is 5,500 sats",
    MinFlashcardLimit: "Minimum amount when reloading from flashcard is 100 sats",
    amountExceed: "Amount exceeds your balance of {balance: string}",
    amountExceedsLimit: "Amount exceeds your remaining daily limit of {limit: string}",
    upgradeAccountToIncreaseLimit: "Upgrade your account to increase your limit",
    amountIsRequired: "Amount is required",
    cost: "Cost",
    destination: "Destination",
    destinationIsRequired: "Destination is required",
    fee: "network fee",
    feeCalculationUnsuccessful: "Calculation unsuccessful ⚠️",
    placeholder: "Username, invoice, or address",
    invalidUsername: "Invalid username",
    noAmount:
      "This invoice doesn't have an amount, so you need to manually specify how much money you want to send",
    notConfirmed:
      "Payment has been sent\nbut is not confirmed yet\n\nYou can check the status\nof the payment in Transactions",
    note: "Note or label",
    success: "Payment has been sent successfully",
    suggestionInput: "Enter your suggestion",
    max: "Max",
    maxAmount: "Max Amount",
    title: "Send Bitcoin",
    send: "Send",
    failedToFetchLnurlInvoice: "Failed to fetch lnurl invoice",
    lnurlInvoiceIncorrectAmount:
      "The lnurl server responded with an invoice with an incorrect amount.",
    lnurlInvoiceIncorrectDescription:
      "The lnurl server responded with an invoice with an incorrect description hash.",
		noAmountInvoiceError: "No amount invoice is not supported in BTC wallet. Please go back and scan or enter an invoice with an amount added.",
    onchainMinAmountInvoiceError: "The amount you entered is less than the minimum amount required to send an on-chain transaction {amount: number}. Please consider sending this amount via Lightning!",
		minAmountInvoiceError: "The amount on the invoice is less than minimum amount {amount: number}",
		maxAmountInvoiceError: "The amount on the invoice is greater than maximum amount {amount: number}",
		minAmountConvertError: "The conversion amount is less than minimum required amount {amount: number}",
		maxAmountConvertError: "The conversion amount is greater than maximum amount {amount: number}"
   
  },
  SettingsScreen: {
    staticQr: "Printable Static QR Code",
    staticQrCopied: "Your static QR code link has been copied",
    setByOs: "Set by OS",
    apiAcess: "API Access",
    pos: "Point of Sale",
    posCopied: "Your point of sale link has been copied",
    setYourLightningAddress: "Set Your Username",
    activated: "Activated",
    addressScreen: "Ways to get paid",
    tapUserName: "Tap to set username",
    title: "Settings",
    darkMode: "Dark Mode",
    setToDark: "Mode: dark.",
    setToLight: "Mode: light.",
    darkDefault: "Mode: dark, (Default).",
    lightDefault: "Mode: light, (Default).",
    csvTransactionsError:
      "Unable to export transactions to csv. Something went wrong. If issue persists please contact support.",
    lnurlNoUsername:
      "To generate an lnurl address you must first set a username.  Do you want to set a username now?",
    copyClipboardLnurl: "Lnurl address has been copied in the clipboard",
    defaultWallet: "Default Account",
    rateUs: "Rate us on {storeName: string}",
    theme: "Theme",
    nfc: "Receive from NFC",
    nfcError: "Error reading NFC tag. Please try again.",
    nfcNotCompatible:
      "The information fetch from the card is not a compatible lnurl-withdraw link.",
    nfcOnlyReceive: "Only receive from NFC is available for now",
    nfcScanNow: "Scan NFC Now",
    nfcNotSupported: "NFC is not supported on this device",
    logInOrCreateAccount: "Log in or create account",
    backup: "Backup",
    importWallet: "Import Wallet",
    showSeedPhrase: "Reveal recovery phrase",
    showNostrSecret: "Chat Settings",
    beginnerMode: "Disable Bitcoin Account",
    advanceMode: "Enable Bitcoin Account (Advanced Mode)",
    keysManagement: "Keys management",
		showBtcAccount: "Show Bitcoin account",
		hideBtcAccount: "Hide Bitcoin account"
  },
  NotificationSettingsScreen: {
    title: "Notification Settings",
    pushNotifications: "Push Notifications",
    notificationCategories: {
      Circles: {
        title: "Circles",
        description: "Notifications about your circles.",
      },
      Payments: {
        title: "Payments",
        description: "Notifications related to sending and receiving payments.",
      },
      Marketing: {
        title: "Features and updates",
        description: "Notifications about new features and updates.",
      },
      Price: {
        title: "Price changes",
        description: "Notifications about the price of Bitcoin.",
      }
    }
  },
  AccountScreen: {
    fundsMoreThan5Dollars: "Your account has more than $5",
    itsATrialAccount: "Trial accounts have reduced transaction limits and no recovery method. If you lose your phone or uninstall the app, your funds will be unrecoverable.",
    accountBeingDeleted: "Your account is being deleted, please wait...",
    dangerZone: "Danger Zone",
    phoneDeletedSuccessfully: "Phone deleted successfully",
    phoneNumber: "Phone Number",
    tapToAddPhoneNumber: "Tap to add phone number",
    loginMethods: "Login Methods",
    level: "Level {level: string}",
    accountLevel: "Account Level",
    upgrade: "Upgrade your account",
    logOutAndDeleteLocalData: "Log out and clear all local data",
    IUnderstand: "I understand. Please log me out.",
    logoutAlertTitle: "Are you sure you want to log out and delete all local data?",
    logoutAlertContentPhone: "You will need to re-enter your phone number to log back in.\nyour phone number is {phoneNumber: string} so make sure you have access to it to log back in",
    logoutAlertContentEmail: "You will need to re-enter your email to log back in.\nyour email is {email: string} so make sure you have access to it to log back in",
    logoutAlertContentPhoneEmail: "You will need to re-enter either your phone number or email to log back in.\nyour phone number is {phoneNumber: string} and your email is {email: string} so make sure you have access to those to log back in",
    usdBalanceWarning: "You have a Cash balance of {balance: string}.",
    btcBalanceWarning: "You have a bitcoin balance of {balance: string}.",
    secureYourAccount: "Register to secure your account",
    tapToAdd: "Tap to add",
    tapToAddEmail: "Tap to add email",
    unverifiedEmail: "Email (Unverified)",
    email: "Email",
    emailDeletedSuccessfully: "Email deleted successfully",
    unverifiedEmailAdvice: "Unverified emails can't be used to login. You should re-verify your email address.",
    deleteEmailPromptTitle: "Delete email",
    deleteEmailPromptContent: "Are you sure you want to delete your email address? you will only be able to log back in with your phone number.",
    deletePhonePromptTitle: "Delete phone",
    deletePhonePromptContent: "Are you sure you want to delete your phone number? you will only be able to log in back with your email.",
    addEmailFirst: "Add an email first",
    addPhoneFirst: "Add a phone first",
    phoneNumberAuthentication: "Phone number (for login)",
    emailAuthentication: "Email (for login)",
    removePhone: "Remove phone",
    removeEmail: "Remove email",
    unverified: "Email is unverified",
    unverifiedContent: "Secure your account by verifying your email.",
    confirmEmail: "Confirm email",
    emailUnverified: "Your email is unverified",
    emailUnverifiedContent: "Ensure you can log back into your account by verifying your email. Do you want to do the verification now?",
    totp: "Two-factor authentication",
    totpDeactivated: "Two-factor authentication has been deactivated",
    totpDeleteAlertTitle: "Delete two-factor authentication",
    totpDeleteAlertContent: "Are you sure you want to delete your two-factor authentication?",
    copiedAccountId: "Copied your account ID to clipboard",
    yourAccountId: "Your Account ID",
    accountId: "Account ID",
    copy: "Copy"
  },
  TotpRegistrationInitiateScreen: {
    title: "Two-factor authentication",
    content: "Scan this QR code with your authenticator app. Alternatively, you can manually copy/paste the secret into your authenticator app."
  },
  TotpRegistrationValidateScreen: {
    title: "Two-factor authentication",
    enter6digitCode: "Enter the 6-digit code from your authenticator app to validate your two-factor authentication.",
    success: "Two-factor authentication has been enabled. You will now only be able to log back in with your phone or email AND your two factor authentication.\n\nOnly full KYC accounts may be recovered in the case a user has lost access to their two-factor authentication.",
  },
  TotpLoginValidateScreen: {
    title: "Two-factor authentication",
    content: "Enter the 6-digit code from your authenticator app to log in. This code changes every 30 seconds.",
  },
  BackupOptions: {		
		title: "Backup options",
    recoveryPhrase: "Recovery Phrase",
    recoveryPhraseDesc: "Backup Bitcoin Wallet using recovery phrase",
    revealRecoveryPhrase: "Reveal Recovery Phrase",
    revealRecoveryPhraseDesc: "Use your recovery phrase to import Bitcoin Wallet",
    phone: "Phone",
    phoneDesc: "Backup Cash Wallet using phone number",
    usePhoneNumber: "Use your phone number to import Cash Wallet",
		done: "Done",
	},
  BackupStart: {
    title: "First, let's create your \nrecovery phrase",
    description: "A recovery phrase is a series of 12 words in a specific order. This word combination is unique to your wallet. Make sure to have pen and paper ready so you can write it down.",
    continue: "Continue"
  },
  BackupSeedPhrase: {
    title: "This is your recovery phrase",
    description: "Make sure to write it down as shown here. You have to verify this later.",
    backupToICloud: "Backup to iCloud",
    backupToGoogleDrive: "Backup to Google Drive",
    verify: "Verify"
  },
  BackupDoubleCheck: {
		title: "Let's double-check",
		description1: "Well done. Now let’s verify that you've written down your recovery phrase correctly.",
		description2: "Yes, it’s that important.",
		continue: "Continue"
	},
  BackupVerify: {
		title: "Tap the words in the \ncorrect order.",
    correctTitle: "Perfect. Make sure to securely store your recovery phrase.",
    wrongTitle: "Sorry, that’s not the correct third word. Give it another try.",
		tryAgain: "Try again",
		continue: "Continue"
	},
  BackupComplete: {
		title: "Your backup is complete",
		description: "You should now have your recovery phrase and password written down for future reference.",
		complete: "Complete"
	},
  BackupShowSeedPhrase: {
    title: "This is your recovery phrase",
    description: "Make sure to write it down as shown here. You'll need to recover your wallet.",
    done: "Done"
  },
  ImportWalletOptions: {		
		loginOptions: "Login options",
		importOptions: "Import wallet options",
    recoveryPhrase: "Recovery Phrase",
    importBTCWallet: "Import Bitcoin Wallet using recovery phrase",
    phone: "Phone",
    importUsingPhone: "Import or Create your Cash Wallet using phone number",
    email: "Email",
    importUsingEmail: "Import your Cash Wallet using email address",
		login: "Login/Create",
    done: "Done",
	},
  ImportWallet: {		
		title: "Sign in with a recovery phrase",
		importTitle: "Import your wallet with a recovery phrase",
		description: "This is a 12-word phrase you were given when you created your previous wallet.",
		complete: "Complete",
	},
  TransactionHistoryTabs: {		
		titleBTC: "BTC",
		titleUSD: "USD"
	},
  CopySecretComponent: {
    button: "Copy secret",
    toastMessage: "Secret copied to clipboard!"
  },
  DefaultWalletScreen: {
    title: "Default Account",
    info:
      "Pick which account to set as default for receiving and sending. You can adjust the send and receive account for individual payments in the mobile app. Payments received through the cash register or your Lightning address will always go to the Cash (USD) account.\n\nTo avoid Bitcoin's volatility, choose Cash. This allows you to maintain a stable amount of money while still being able to send and receive payments.\n\nYou can change this setting at any time, and it won't affect your current balance.",
  },
  ThemeScreen: {
    title: "Theme",
    info: "Pick your preferred theme for using Flash, or choose to keep it synced with your system settings.",
    system: "Use System setting",
    light: "Use Light Mode",
    dark: "Use Dark Mode",
    setToDark: "Dark Mode",
    setToLight: "Light Mode",
  },
  Languages: {
    DEFAULT: "Default (OS)",
  },
  StablesatsModal: {
    header: "With Stablesats, you now have a USD account added to your wallet!",
    body:
      "You can use it to send and receive Bitcoin, and instantly transfer value between your BTC and USD account. Value in the USD account will not fluctuate with the price of Bitcoin. This feature is not compatible with the traditional banking system.",
    termsAndConditions: "Read the Terms & Conditions.",
    learnMore: "Learn more about Stablesats",
  },
  AdvancedModeModal: {
    header: "Welcome to Advanced Mode!",
    body:
      "- Your BTC is non-custodial, fees may apply.\n" +
      "- You can swap between BTC and USD.\n" +
      "- BTC may take up to 60s to confirm.\n\n" +
      "DO NOT SHARE YOUR RECOVERY PHRASE!",
    termsAndConditions: "Read the Terms & Conditions.",
    learnMore: "What is a Non-Custodial Wallet?",
    importWallet: "Import Wallet",
		createWallet: "Create Wallet"
},
  MerchantSuggestModal: {
    header: "Add Flashpoint",
    body: "You have selected a location for your business on the map. Flash users will be able to find you on the map, and send you payments by clicking on your map pin.",
    termsAndConditions: "\nRead the Terms & Conditions.",
    learnMore: "Your pin request will be processed within 24 hours.",
  },
  UnVerifiedSeedModal: {
    header: "YOUR BITCOIN IS NOT SECURE!",
    body:
      "You should WRITE DOWN your recovery phrase somewhere safe in order to protect your money. If you lose your phone or uninstall the app without writing down your recovery phrase, you will lose access to your funds.\n\n",
    termsAndConditions: "\nRead the Terms & Conditions.",
    learnMore: "What is a Recovery Phase?",
  },
  SplashScreen: {
    update:
      "Your app is outdated. An update is needed before the app can be used.\n\nThis can be done from the PlayStore for Android and Testflight for iOS",
  },
  TransactionDetailScreen: {
    paid: "Paid to/from",
    received: "You received",
    spent: "You spent",
    receivingAccount: "Receiving Account",
    sendingAccount: "Sending Account",
    txNotBroadcast:
      "Your transaction is currently pending and will be broadcasted to the Bitcoin network in a moment.",
  },
  TransactionLimitsScreen: {
    receive: "Receive",
    withdraw: "Withdraw",
    perDay: "per day",
    perWeek: "per week",
    unlimited: "Unlimited",
    remaining: "Remaining",
    stablesatTransfers: "Stablesat Transfers",
    internalSend: "Send to {bankName: string} User",
    error: "Unable to fetch limits at this time",
    contactUsMessageBody:
      "Hi, I would like to upgrade my account to a {bankName: string} Business account.",
    contactUsMessageSubject: "Flash Business Upgrade Request",
    contactSupportToPerformKyc:
      "Contact support to perform manual KYC and upgrade to {bankName: string} Business",
    increaseLimits: "Increase your limits",
    spendingLimits: "Spending Limits",
    spendingLimitsDescription: "The spending limits shown on this page are denominated in USD. For your convenience, we convert these limits into your local currency based on current foreign exchange rates. Please note that the displayed local currency amount may fluctuate as exchange rates are updated in real-time.",
    requestBusiness: "Request Business Account",
  },
  TransactionScreen: {
    noTransaction: "No transaction to show",
    title: "Recent activity",
    recentTransactions: "Recent transactions",
    transactionHistoryTitle: "Transaction History",
  },
  TransferScreen: {
    title: "Transfer",
    percentageToConvert: "% to convert",
  },
  UpgradeAccountModal: {
    title: "Upgrade your account",
    backUpFunds: "Back up your funds",
    higherLimits: "Increase your transaction limits",
    receiveOnchain: "Earn rewards",
    onlyAPhoneNumber: "Quick and easy phone number verification",
    letsGo: "Let's go!",
    stayInTrialMode: "Maybe later",
  },
  SetAddressModal: {
    helloText: "Hello!",
    whoAreYou: "What should we call you?",
    usernameHint: "This will be your {bankName: string} username",
    placeholder: "Enter your username",
    title: "Set {bankName: string} address",
    save: "Save",
    Errors: {
      tooShort: "Username must be at least 3 characters long",
      tooLong: "Address must be at most 50 characters long",
      invalidCharacter: "Address can only contain letters, numbers, and underscores",
      startsWithNumber: "Your username must begin with an uppercase or lowercase letter",
      addressUnavailable: "Sorry, this address is already taken",
      unknownError: "An unknown error occurred, please try again later",
    },
    receiveMoney:
      "Receive money from other lightning wallets and {bankName: string} users with this address.",
    itCannotBeChanged: "It can't be changed later.",
  },
  WelcomeFirstScreen: {
    bank:
      "Bitcoin is designed to let you store, send and receive money, without relying on a bank or credit card.",
    before:
      "Before Bitcoin, people had to rely on banks or credit card providers, to spend, send and receive money.",
    care: "Why should I care?",
    learn: "I don't mean to badger you, but there's lot more to learn, dig in...",
    learnToEarn: "Learn to Earn",
  },
  PhoneLoginInitiateScreen: {
    title: "Account set up",
    header: "Enter your phone number, and we'll text you an access code.",
    headerVerify: "Verify you are human",
    errorRequestingCaptcha:
      "Something went wrong verifying you are human, please try again later.",
    errorRequestingCode:
      "Something went wrong requesting the phone code, please try again later.",
    errorInvalidPhoneNumber:
      "Invalid phone number. Are you sure you entered the right number?",
    errorUnsupportedCountry: "We are unable to support customers in your country.",
    placeholder: "Phone Number",
    verify: "Click to Verify",
    sms: "Send via SMS",
    whatsapp: "Send via WhatsApp",
  },
  PhoneLoginValidationScreen: {
    errorLoggingIn: "Error logging in. Did you use the right code?",
    errorTooManyAttempts: "Too many attempts. Please try again later.",
    errorCannotUpgradeToExistingAccount:
      "This phone account already exists. Please log out of your trial account and then log in with your phone number.",
    header:
      "To confirm your phone number, enter the code we just sent you by {channel: string} on {phoneNumber: string}",
    placeholder: "6 Digit Code",
    sendAgain: "Send Again",
    tryAgain: "Try Again",
    sendViaOtherChannel:
      "You selected to receive the code via {channel: string}. You can try receiving via {other: string} instead",
  },
  PhoneRegistrationInitiateScreen: {
    title: "Phone set up",
    header: "Enter your phone number, and we'll text you an access code.",
    headerVerify: "Verify you are human",
    errorRequestingCode: "Something went wrong requesting the phone code, please try again later.",
    errorInvalidPhoneNumber: "Invalid phone number. Are you sure you entered the right number?",
    errorUnsupportedCountry: "We are unable to support customers in your country.",
    placeholder: "Phone Number",
    verify: "Click to Verify",
    sms: "Send via SMS",
    whatsapp: "Send via WhatsApp",
  },
  PhoneRegistrationValidateScreen: {
    successTitle: "Phone number confirmed",
  },
  EmailRegistrationInitiateScreen: {
    title: "Add your email",
    header: "Enter your email address, and we'll send you an access code.",
    invalidEmail: "Invalid email address. Are you sure you entered the right email?",
    send: "Send code",
    missingEmailRegistrationId: "Missing email registration id",
    placeholder: "hal@finney.org",
  },
  EmailRegistrationValidateScreen: {
    header: "To confirm your email address, enter the code we just sent you on {email: string}",
    success: "Email {email: string} confirmed successfully",
  },
  EmailLoginInitiateScreen: {
    title: "Login via email",
    header: "Enter your email address, and we'll send you an access code.",
    invalidEmail: "Invalid email address. Are you sure you entered the right email?",
    send: "Send code",
  },
  EmailLoginValidateScreen: {
    header: "If there is an account attached to {email: string}, you should have received 6 digits code to enter below.\n\nIf you are not receiving anything, it's probably either because this is not the right email, the email is in your spam folder.",
    success: "Email {email: string} confirmed successfully",
  },
  common: {
    enabled: "Enabled",
    notifications: "Notifications",
    preferences: "Preferences",
    onDeviceSecurity: "On-Device Security",
    securityAndPrivacy: "Security and Privacy",
    advanced: "Advanced",
    community: "Community",
    account: "Account",
    trialAccount: "Trial Account",
    flashUser: "Flash User",
    transactionLimits: "Transaction Limits",
    activateWallet: "Activate Wallet",
    amountRequired: "Amount is required",
    back: "Back",
    backHome: "Back Home",
    revealSeed: "Show Recovery Phrase",
    bank: "Bank",
    bankAccount: "Cash Account",
    bankAdvice: "{bankName: string} Advice",
    bankInfo: "{bankName: string} Info",
    beta: "beta",
    bitcoin: "Bitcoin",
    bitcoinPrice: "Bitcoin Price",
    btcAccount: "Bitcoin Account",
    cancel: "Cancel",
    close: "Close",
    confirm: "Confirm",
    convert: "Convert",
    codeConfirmation: "Code Confirmation",
    currency: "Currency",
    currencySyncIssue: "Currency issue. Refresh needed",
    csvExport: "Export transactions as CSV",
    date: "Date",
    description: "Description",
    domain: "Domain",
    email: "Email",
    error: "Error",
    fatal: "Fatal",
    fee: "fee",
    Fee: "Fee",
    fees: "Fees",
    firstName: "First Name",
    from: "From",
    hour: "hour",
    hours: "hours",
    invoice: "Invoice",
    language: "Language",
    languagePreference: "Language preference",
    lastName: "Last Name",
    later: "Later",
    loggedOut: "You have been logged out.",
    logout: "Log Out",
    minutes: "minutes",
    errorAuthToken: "Missing auth token",
    needWallet: "Create an account to access your wallet",
    next: "Next",
    No: "No",
    note: "Note",
    notification: "Notification",
    ok: "OK",
    or: "or",
    openWallet: "Open Wallet",
    phone: "Phone",
    phoneNumber: "Phone Number",
    rate: "Rate",
    reauth: "Your session has expired. Please log in again.",
    request: "Request Pin",
    restart: "Restart",
    sats: "sats",
    search: "Search",
    chatSearch: "username or nostr pubkey",
    security: "Security",
    send: "Send",
    setAnAmount: "set an amount",
    share: "Share",
    shareBitcoin: "Share Bitcoin Address",
    shareLightning: "Share Lightning Invoice",
    soon: "Coming soon!",
    submit: "Submit",
    success: "Success!",
    stablesatsUsd: "Cash (USD)",
    to: "To",
    total: "Total",
    transactions: "Transactions",
    transactionsError: "Error loading transactions",
    tryAgain: "Try Again",
    type: "Type",
    usdAccount: "Cash Account",
    username: "Username",
    usernameRequired: "Username is required",
    backupAccount: "Backup/upgrade account",
    viewTransaction: "View transaction",
    yes: "Yes",
    pending: "pending",
    today: "Today",
    yesterday: "Yesterday",
    thisMonth: "This month",
    prevMonths: "Previous months",
    problemMaybeReauth:
      "There was a problem with your request. Please retry in one minute. If the problem persist, we recommend that you log out and log back in. You can log out by going into Settings > Account > Log out",
    warning: "Warning",
  },
  errors: {
    generic: "There was an error.\nPlease try again later.",
    invalidEmail: "Invalid email",
    invalidPhoneNumber: "is not a valid phone number",
    tooManyRequestsPhoneCode:
      "Too many requests. Please wait before requesting another text message.",
    network: {
      server: "Server Error. Please try again later",
      request: "Request issue.\nContact support if the problem persists",
      connection: "Connection issue.\nVerify your internet connection",
    },
    unexpectedError: "Unexpected error occurred",
    restartApp: "Please restart the application.",
    problemPersists: "If problem persists contact support.",
    fatalError:
      "Sorry we appear to be having issues loading the application data.  If problems persist please contact support.",
    showError: "Show Error",
    clearAppData: "Clear App Data and Logout",
  },
  notifications: {
    payment: {
      body: "You just received {value: string} sats",
      title: "Payment received",
    },
  },
  reports: {
    title: "Generate Reports",
		reconciliation: "Reconciliation Report",
		aggregation: "Aggregation Report",
		topRecipients: "Top Recipients Report",
		topSenders: "Top Senders Report",
		selectFromDate: "Select From Date",
		selectToDate: "Select To Date",
		fromDate: "From",
		toDate: "To",
    total: "Total",
  },
  support: {
    contactUs: "Need help? Contact us.",
    joinTheCommunity: "Join the community",
    whatsapp: "WhatsApp",
    email: "Email",
    enjoyingApp: "Enjoying the app?",
    statusPage: "Status Page",
    //telegram: "Telegram",
    discord: "Discord",
    mattermost: "Mattermost",
    thankYouText: "Thank you for the feedback, would you like to suggest an improvement?",
    defaultEmailSubject: "{bankName: string} - Support",
    defaultSupportMessage:
      "Hey there! I need some help with {bankName: string}, I'm using the version {version: string} on {os: string}.",
    emailCopied: "email {email: string} copied to clipboard",
    deleteAccount: "Delete account",
    delete: "delete",
    typeDelete: 'Please type "{delete: string}" to confirm account deletion',
    finalConfirmationAccountDeletionTitle: "Final Confirmation Required",
    finalConfirmationAccountDeletionMessage:
      "Are you sure you want to delete your account? This action is irreversible.",
    deleteAccountBalanceWarning:
      "Deleting your account will cause you to lose access to your current balance. Are you sure you want to proceed?",
    deleteAccountConfirmation:
      "Your account has been written for deletion.\n\nWhen the probation period related to regulatory requirement is over, the remaining data related to your account will be permanently deleted.",
    deleteAccountFromPhone:
      "Hey there!, please delete my account. My phone number is {phoneNumber: string}.",
    deleteAccountError:
      "Something went wrong. Contact {email: string} for further assistance.",
    bye: "Bye!",
    switchToBeginnerMode: "By switching to Beginner Mode you will not lose access to your BTC wallet funds, but the wallet will be hidden. You can switch to Advanced Mode again at any time. Are you sure you want to proceed?"
  },
  lnurl: {
    overLimit: "You can't send more than max amount",
    underLimit: "You can't send less than min amount",
    commentRequired: "Comment required",
    viewPrintable: "View Printable Version",
  },
  DisplayCurrencyScreen: {
    errorLoading: "Error loading list of currencies",
  },
  AmountInputScreen: {
    enterAmount: "Enter Amount",
    setAmount: "Set Amount",
    maxAmountExceeded: "Amount must not exceed {maxAmount: string}.",
    minAmountNotMet: "Amount must be at least {minAmount: string}.",
  },
  AmountInputButton: {
    tapToSetAmount: "Add an amount",
    tapToSetOnChainAmount: "Add an amount",
    enterAmount: "Please enter the amount to proceed",
  },
  AppUpdate: {
    needToUpdateSupportMessage:
      "I need to update my app to the latest version. I'm using the {os: string} app with version {version: string}.",
    versionNotSupported: "This mobile version is no longer supported",
    updateMandatory: "Update is mandatory",
    tapHereUpdate: "Tap here to update now",
    contactSupport: "Contact Support",
  },
  RefundFlow: {
    refundListTitle: "Refundable Transactions",
		destinationTitle: "Destination",
		confirmationTitle: "Confirmation",
    pendingTransactions: "Pending Transactions",
    noRefundables: "No refundable transactions found",
    view: "View",
    refund: "Refund",
    refundTo: "Refund to USD wallet",
    recommendedFees: "Recommended Fees",
    fast: "Fast",
    halfHour: "Half Hour",
    hour: "Hour",
    txId: "Transaction ID"
	},
  Nostr: {
    editProfile: "Edit Profile",
    importNsecTitle: "Import Your Nostr Secret Key",
    importNsecDefaultDescription:
      "You are logged into another device. Please import your nsec from the other device to continue using the chat feature.",
    createProfileTitle: "Create Profile",
    createProfileWarning: "If you proceed, any existing profile data will be overwritten.",
    createProfilePubkeyMessage: "We couldn't find a profile event attached to this pubkey.",
    createProfilePrompt: "Do you want to continue to create?",
    createProfileButton: "Create Profile",
    profileNotFound: "We’re looking, but we haven’t been able to find your profile.",
    promptToCreateProfile: "Would you like to create one now?",
      learnAboutNostr: "Learn about Nostr",
    learnAboutNostrSubtext: "Explore this guide to get the most out of nostr chat",
    showPublicKey: "Show public key",
    showPrivateKey: "Show private key",
    profileConnected: "Profile Connected",
    reconnectProfile: "Reconnect Profile",
    tapToRefreshConnection: "Tap to refresh connection",
    importExistingProfile: "Import existing profile",
    deleteProfile: "Delete profile",
    noProfileIdExists: "No Profile ID exists",
    profileReconnected: "Your profile has been reconnected successfully",
    deleteWarningTitle: "Warning",
    deleteWarningMessage:
      "Deleting your profile keys will remove your account from this device. Without a backup, you won't be able to access this profile again. Are you sure?",
    importNsecDescription: "If you wish to use your own nsec, paste it below.",
    profileImportedSuccessfully: "Profile imported successfully",
      noProfileFound: "No Nostr Profile Found",
    noProfileDescription: "You haven’t created a Nostr profile yet.\nTap below to create one.",
    creatingProfile: "Creating Profile...",
    createNewProfile: "Create New Profile",
    findingYou: "Finding You..",
    advancedSettings: "Advanced Nostr Settings",
    KeyModal: {
      yourPublicProfileId: "Your Public Profile ID",
      yourPrivateProfileKey: "Your Private Profile Key",
      keyCopiedToClipboard: "Key copied to clipboard",
    },
    Contacts: {
      stillLoading: "Having trouble finding your contact list, have you followed anyone yet?",
      noCantacts: "No Contacts Available",
      profile: "Profile",
      nostrUser: "Nostr User",
      message: "Message",
      sendPayment: "Send Payment",
      contactInfo: "Contact Info",
      contactManagement: "Contact Management",
      unfollowContact: "Unfollow Contact"
    },
    common: {
      copy: "Copy",
      copied: "Copied",
    }
  }
}

export default en
