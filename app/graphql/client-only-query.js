"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setHasPromptedSetDefaultAccount = exports.setFeedbackModalShown = exports.updateColorScheme = exports.activateBeta = exports.saveHiddenBalanceToolTip = exports.saveHideBalance = void 0;
const client_1 = require("@apollo/client");
const generated_1 = require("./generated");
exports.default = (0, client_1.gql) `
  query hideBalance {
    hideBalance @client
  }

  query hiddenBalanceToolTip {
    hiddenBalanceToolTip @client
  }

  query beta {
    beta @client
  }

  query colorScheme {
    colorScheme @client # "system" | "light" | "dark"
  }

  query feedbackModalShown {
    feedbackModalShown @client
  }

  query hasPromptedSetDefaultAccount {
    hasPromptedSetDefaultAccount @client
  }
`;
const saveHideBalance = (client, status) => {
    try {
        client.writeQuery({
            query: generated_1.HideBalanceDocument,
            data: {
                __typename: "Query",
                hideBalance: status,
            },
        });
        return status;
    }
    catch (_a) {
        return false;
    }
};
exports.saveHideBalance = saveHideBalance;
const saveHiddenBalanceToolTip = (client, status) => {
    try {
        client.writeQuery({
            query: generated_1.HiddenBalanceToolTipDocument,
            data: {
                __typename: "Query",
                hiddenBalanceToolTip: status,
            },
        });
        return status;
    }
    catch (_a) {
        return false;
    }
};
exports.saveHiddenBalanceToolTip = saveHiddenBalanceToolTip;
const activateBeta = (client, status) => {
    try {
        client.writeQuery({
            query: generated_1.BetaDocument,
            data: {
                __typename: "Query",
                beta: status,
            },
        });
    }
    catch (_a) {
        console.warn("impossible to update beta");
    }
};
exports.activateBeta = activateBeta;
const updateColorScheme = (client, colorScheme) => {
    try {
        client.writeQuery({
            query: generated_1.ColorSchemeDocument,
            data: {
                __typename: "Query",
                colorScheme,
            },
        });
    }
    catch (_a) {
        console.warn("impossible to update beta");
    }
};
exports.updateColorScheme = updateColorScheme;
const setFeedbackModalShown = (client, shown) => {
    try {
        client.writeQuery({
            query: generated_1.FeedbackModalShownDocument,
            data: {
                __typename: "Query",
                feedbackModalShown: shown,
            },
        });
    }
    catch (_a) {
        console.warn("unable to update feedbackModalShown");
    }
};
exports.setFeedbackModalShown = setFeedbackModalShown;
const setHasPromptedSetDefaultAccount = (client) => {
    try {
        client.writeQuery({
            query: generated_1.HasPromptedSetDefaultAccountDocument,
            data: {
                __typename: "Query",
                hasPromptedSetDefaultAccount: true,
            },
        });
    }
    catch (_a) {
        console.warn("impossible to update hasPromptedSetDefaultAccount");
    }
};
exports.setHasPromptedSetDefaultAccount = setHasPromptedSetDefaultAccount;
//# sourceMappingURL=client-only-query.js.map