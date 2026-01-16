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
exports.UsernameSet = void 0;
const react_1 = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
// components
const galoy_error_box_1 = require("@app/components/atomic/galoy-error-box");
const buttons_1 = require("@app/components/buttons");
const screen_1 = require("@app/components/screen");
// hooks
const use_nostr_profile_1 = __importDefault(require("@app/hooks/use-nostr-profile"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const use_logout_1 = __importDefault(require("@app/hooks/use-logout"));
const hooks_1 = require("@app/hooks");
const chatContext_1 = require("../chat/chatContext");
// gql
const generated_1 = require("../../graphql/generated");
// store
const redux_1 = require("@app/store/redux");
const userSlice_1 = require("@app/store/redux/slices/userSlice");
const validations_1 = require("@app/utils/validations");
const errors_1 = require("@app/types/errors");
// assets
const Flash_Mascot_png_1 = __importDefault(require("@app/assets/images/Flash-Mascot.png"));
const { width } = react_native_1.Dimensions.get("window");
const UsernameSet = ({ navigation, route }) => {
    const dispatch = (0, redux_1.useAppDispatch)();
    const { lnAddressHostname, name } = (0, hooks_1.useAppConfig)().appConfig.galoyInstance;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const { updateNostrProfile } = (0, use_nostr_profile_1.default)();
    const { logout } = (0, use_logout_1.default)();
    const { userProfileEvent } = (0, chatContext_1.useChatContext)();
    const [error, setError] = (0, react_1.useState)();
    const [lnAddress, setLnAddress] = (0, react_1.useState)("");
    const [updateUsername, { loading }] = (0, generated_1.useUserUpdateUsernameMutation)({
        update: (cache, { data }) => {
            var _a, _b;
            if ((_a = data === null || data === void 0 ? void 0 : data.userUpdateUsername) === null || _a === void 0 ? void 0 : _a.user) {
                const userIdQuery = cache.readQuery({
                    query: generated_1.MyUserIdDocument,
                });
                const userId = (_b = userIdQuery.me) === null || _b === void 0 ? void 0 : _b.id;
                if (userId) {
                    cache.modify({
                        id: cache.identify({
                            id: userId,
                            __typename: "User",
                        }),
                        fields: {
                            username: () => {
                                return lnAddress;
                            },
                        },
                    });
                }
            }
        },
    });
    const onSetLightningAddress = async () => {
        var _a, _b, _c, _d;
        const validationResult = (0, validations_1.validateLightningAddress)(lnAddress);
        if (!validationResult.valid) {
            setError(validationResult.error);
        }
        else {
            const { data, errors } = await updateUsername({
                variables: {
                    input: {
                        username: lnAddress,
                    },
                },
            });
            console.log("Mutation response:", data === null || data === void 0 ? void 0 : data.userUpdateUsername);
            // Get existing profile content to preserve picture, banner, etc.
            let existingProfile = {};
            if (userProfileEvent === null || userProfileEvent === void 0 ? void 0 : userProfileEvent.content) {
                try {
                    existingProfile = JSON.parse(userProfileEvent.content);
                    console.log("Existing profile data:", existingProfile);
                }
                catch (e) {
                    console.log("No existing profile found or failed to parse");
                }
            }
            // Merge with new username data
            updateNostrProfile({
                content: Object.assign(Object.assign({}, existingProfile), { name: lnAddress, username: lnAddress, lud16: `${lnAddress}@${lnAddressHostname}`, nip05: `${lnAddress}@${lnAddressHostname}` }),
            });
            if (((_b = (_a = data === null || data === void 0 ? void 0 : data.userUpdateUsername) === null || _a === void 0 ? void 0 : _a.errors) !== null && _b !== void 0 ? _b : []).length > 0) {
                if (((_d = (_c = data === null || data === void 0 ? void 0 : data.userUpdateUsername) === null || _c === void 0 ? void 0 : _c.errors[0]) === null || _d === void 0 ? void 0 : _d.code) === "USERNAME_ERROR") {
                    setError(errors_1.SetAddressError.ADDRESS_UNAVAILABLE);
                }
                else {
                    setError(errors_1.SetAddressError.UNKNOWN_ERROR);
                }
                return;
            }
            dispatch((0, userSlice_1.updateUserData)({ username: lnAddress }));
            navigation.reset({
                index: 0,
                routes: [{ name: "Welcome" }],
            });
        }
    };
    const onCancel = () => {
        var _a;
        if ((_a = route.params) === null || _a === void 0 ? void 0 : _a.insideApp) {
            navigation.popToTop();
        }
        else {
            logout();
            navigation.reset({
                index: 0,
                routes: [{ name: "getStarted" }],
            });
        }
    };
    let errorMessage = "";
    switch (error) {
        case errors_1.SetAddressError.TOO_SHORT:
            errorMessage = LL.SetAddressModal.Errors.tooShort();
            break;
        case errors_1.SetAddressError.TOO_LONG:
            errorMessage = LL.SetAddressModal.Errors.tooLong();
            break;
        case errors_1.SetAddressError.INVALID_CHARACTER:
            errorMessage = LL.SetAddressModal.Errors.invalidCharacter();
            break;
        case errors_1.SetAddressError.STARTS_WITH_NUMBER:
            errorMessage = LL.SetAddressModal.Errors.startsWithNumber();
            break;
        case errors_1.SetAddressError.ADDRESS_UNAVAILABLE:
            errorMessage = LL.SetAddressModal.Errors.addressUnavailable();
            break;
        case errors_1.SetAddressError.UNKNOWN_ERROR:
            errorMessage = LL.SetAddressModal.Errors.unknownError();
            break;
    }
    return (<screen_1.Screen backgroundColor={colors.background}>
      <react_native_1.View style={styles.wrapper}>
        <react_native_1.Image source={Flash_Mascot_png_1.default} style={styles.image}/>
        <react_native_1.View style={styles.container}>
          <themed_1.Text type="h06">{LL.SetAddressModal.helloText()}</themed_1.Text>
          <themed_1.Text type="h02" style={styles.title}>
            {LL.SetAddressModal.whoAreYou()}
          </themed_1.Text>
          <themed_1.Text type="bm" color={colors.placeholder} style={styles.caption}>
            {LL.SetAddressModal.usernameHint({ bankName: name })}
          </themed_1.Text>
          <react_native_1.TextInput autoCorrect={false} autoComplete="off" autoCapitalize="none" style={styles.textInputStyle} onChangeText={setLnAddress} value={lnAddress} placeholder={LL.SetAddressModal.placeholder()} placeholderTextColor={colors.grey3} keyboardType="default"/>
          {errorMessage && <galoy_error_box_1.GaloyErrorBox errorMessage={errorMessage}/>}
        </react_native_1.View>
        <buttons_1.PrimaryBtn label={LL.SetAddressModal.save()} disabled={lnAddress.length < 3} onPress={onSetLightningAddress} btnStyle={{ marginBottom: 10 }}/>
        <buttons_1.PrimaryBtn type="outline" label={LL.common.cancel()} onPress={onCancel} btnStyle={{ marginBottom: 20 }}/>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.UsernameSet = UsernameSet;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    wrapper: {
        flex: 1,
        paddingHorizontal: 20,
    },
    image: {
        width: width / 1.5,
        height: width / 1.5,
        position: "absolute",
        right: 20,
        top: 20,
    },
    container: {
        flex: 1,
        justifyContent: "center",
    },
    title: {
        marginBottom: 50,
    },
    caption: {
        marginLeft: 5,
        marginBottom: 5,
    },
    textInputStyle: {
        paddingVertical: 15,
        paddingHorizontal: 10,
        backgroundColor: colors.white,
        fontSize: 18,
        fontFamily: "Sora-Regular",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.button01,
        marginBottom: 10,
    },
}));
//# sourceMappingURL=username-set.js.map