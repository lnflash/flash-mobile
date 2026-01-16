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
exports.NotificationSettingsScreen = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const screen_1 = require("../../components/screen");
(0, client_1.gql) `
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

  mutation accountEnableNotificationChannel(
    $input: AccountEnableNotificationChannelInput!
  ) {
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

  mutation accountDisableNotificationChannel(
    $input: AccountDisableNotificationChannelInput!
  ) {
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

  mutation accountEnableNotificationCategory(
    $input: AccountEnableNotificationCategoryInput!
  ) {
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

  mutation accountDisableNotificationCategory(
    $input: AccountDisableNotificationCategoryInput!
  ) {
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
const NotificationCategories = {
    // Circles: "Circles",
    Payments: "Payments",
    Price: "Price",
    Marketing: "Marketing",
};
const NotificationSettingsScreen = () => {
    var _a, _b, _c, _d;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data } = (0, generated_1.useNotificationSettingsQuery)({
        fetchPolicy: "cache-first",
        skip: !isAuthed,
    });
    const accountId = (_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.id;
    const notificationSettings = (_d = (_c = data === null || data === void 0 ? void 0 : data.me) === null || _c === void 0 ? void 0 : _c.defaultAccount) === null || _d === void 0 ? void 0 : _d.notificationSettings;
    const [enableNotificationChannel] = (0, generated_1.useAccountEnableNotificationChannelMutation)({
        optimisticResponse: accountId && notificationSettings
            ? () => optimisticEnableChannelResponse({
                notificationSettings,
                accountId,
            })
            : undefined,
    });
    const [disableNotificationChannel] = (0, generated_1.useAccountDisableNotificationChannelMutation)({
        optimisticResponse: accountId && notificationSettings
            ? () => optimisticDisableChannelResponse({
                notificationSettings,
                accountId,
            })
            : undefined,
    });
    const [enableNotificationCategory] = (0, generated_1.useAccountEnableNotificationCategoryMutation)({
        optimisticResponse: accountId && notificationSettings
            ? (vars) => optimisticEnableCategoryResponse({
                notificationSettings,
                accountId,
                category: vars.input.category,
            })
            : undefined,
    });
    const [disableNotificationCategory] = (0, generated_1.useAccountDisableNotificationCategoryMutation)({
        optimisticResponse: accountId && notificationSettings
            ? (vars) => optimisticDisableCategoryResponse({
                notificationSettings,
                accountId,
                category: vars.input.category,
            })
            : undefined,
    });
    const pushNotificationsEnabled = notificationSettings === null || notificationSettings === void 0 ? void 0 : notificationSettings.push.enabled;
    const pushNotificationCategoryEnabled = (category) => {
        return !(notificationSettings === null || notificationSettings === void 0 ? void 0 : notificationSettings.push.disabledCategories.includes(category));
    };
    const toggleCategory = async (category, enabled, channel) => {
        if (enabled) {
            await enableNotificationCategory({
                variables: {
                    input: {
                        category,
                        channel,
                    },
                },
            });
        }
        else {
            await disableNotificationCategory({
                variables: {
                    input: {
                        category,
                        channel,
                    },
                },
            });
        }
    };
    const pushNotificationSettings = Object.values(NotificationCategories).map((category) => {
        return (<react_native_1.View style={styles.settingsRow} key={category}>
          <themed_1.Switch value={pushNotificationCategoryEnabled(category)} onValueChange={(value) => toggleCategory(category, value, generated_1.NotificationChannel.Push)}/>
          <themed_1.Text type="h2">
            {LL.NotificationSettingsScreen.notificationCategories[category].title()}
          </themed_1.Text>
        </react_native_1.View>);
    });
    return (<screen_1.Screen style={styles.container} preset="scroll">
      <react_native_1.View style={styles.settingsHeader}>
        <themed_1.Switch value={pushNotificationsEnabled} onValueChange={async (enabled) => {
            if (enabled) {
                await enableNotificationChannel({
                    variables: {
                        input: {
                            channel: generated_1.NotificationChannel.Push,
                        },
                    },
                });
            }
            else {
                await disableNotificationChannel({
                    variables: {
                        input: {
                            channel: generated_1.NotificationChannel.Push,
                        },
                    },
                });
            }
        }}/>
        <themed_1.Text type="h1">{LL.NotificationSettingsScreen.pushNotifications()}</themed_1.Text>
      </react_native_1.View>
      {pushNotificationsEnabled && (<react_native_1.View style={styles.settingsBody}>{pushNotificationSettings}</react_native_1.View>)}
    </screen_1.Screen>);
};
exports.NotificationSettingsScreen = NotificationSettingsScreen;
const useStyles = (0, themed_1.makeStyles)(() => ({
    container: {
        padding: 20,
        rowGap: 20,
    },
    settingsHeader: {
        flexDirection: "row",
        justifyContent: "flex-start",
        columnGap: 10,
    },
    settingsBody: {
        marginLeft: 40,
        columnGap: 10,
        rowGap: 20,
    },
    settingsRow: {
        flexDirection: "row",
        justifyContent: "flex-start",
        alignItems: "center",
        columnGap: 10,
    },
}));
const optimisticEnableChannelResponse = ({ notificationSettings, accountId, }) => {
    return {
        accountEnableNotificationChannel: {
            account: {
                id: accountId,
                notificationSettings: {
                    push: {
                        enabled: true,
                        disabledCategories: notificationSettings.push.disabledCategories,
                        __typename: "NotificationChannelSettings",
                    },
                    __typename: "NotificationSettings",
                },
                __typename: "ConsumerAccount",
            },
            errors: [],
            __typename: "AccountUpdateNotificationSettingsPayload",
        },
        __typename: "Mutation",
    };
};
const optimisticDisableChannelResponse = ({ notificationSettings, accountId, }) => {
    return {
        accountDisableNotificationChannel: {
            account: {
                id: accountId,
                notificationSettings: {
                    push: {
                        enabled: false,
                        disabledCategories: notificationSettings.push.disabledCategories,
                        __typename: "NotificationChannelSettings",
                    },
                    __typename: "NotificationSettings",
                },
                __typename: "ConsumerAccount",
            },
            errors: [],
            __typename: "AccountUpdateNotificationSettingsPayload",
        },
        __typename: "Mutation",
    };
};
const optimisticEnableCategoryResponse = ({ notificationSettings, accountId, category, }) => {
    return {
        accountEnableNotificationCategory: {
            account: {
                id: accountId,
                notificationSettings: {
                    push: {
                        enabled: true,
                        disabledCategories: notificationSettings.push.disabledCategories.filter((c) => c !== category),
                        __typename: "NotificationChannelSettings",
                    },
                    __typename: "NotificationSettings",
                },
                __typename: "ConsumerAccount",
            },
            errors: [],
            __typename: "AccountUpdateNotificationSettingsPayload",
        },
        __typename: "Mutation",
    };
};
const optimisticDisableCategoryResponse = ({ notificationSettings, accountId, category, }) => {
    return {
        accountDisableNotificationCategory: {
            account: {
                id: accountId,
                notificationSettings: {
                    push: {
                        enabled: true,
                        disabledCategories: [
                            ...notificationSettings.push.disabledCategories,
                            category,
                        ],
                        __typename: "NotificationChannelSettings",
                    },
                    __typename: "NotificationSettings",
                },
                __typename: "ConsumerAccount",
            },
            errors: [],
            __typename: "AccountUpdateNotificationSettingsPayload",
        },
        __typename: "Mutation",
    };
};
//# sourceMappingURL=notifications-screen.js.map