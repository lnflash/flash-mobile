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
exports.SetLightningAddressModalUI = exports.SetLightningAddressModal = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const custom_modal_1 = __importDefault(require("../custom-modal/custom-modal"));
const themed_1 = require("@rneui/themed");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const galoy_error_box_1 = require("../atomic/galoy-error-box");
const client_1 = require("@apollo/client");
const generated_1 = require("../../graphql/generated");
const use_nostr_profile_1 = __importDefault(require("@app/hooks/use-nostr-profile"));
// store
const redux_1 = require("@app/store/redux");
const userSlice_1 = require("@app/store/redux/slices/userSlice");
const nostr_1 = require("@app/utils/nostr");
const nostr_tools_1 = require("nostr-tools");
(0, client_1.gql) `
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
(0, client_1.gql) `
  query myUserId {
    me {
      id
    }
  }
`;
const SetLightningAddressModal = ({ isVisible, toggleModal, }) => {
    const { appConfig: { galoyInstance: { lnAddressHostname: lnDomain }, }, } = (0, hooks_1.useAppConfig)();
    const dispatch = (0, redux_1.useAppDispatch)();
    const [error, setError] = (0, react_1.useState)();
    const [lnAddress, setLnAddress] = (0, react_1.useState)("");
    const [nostrPubkey, setNostrPubkey] = (0, react_1.useState)("");
    const { updateNostrProfile } = (0, use_nostr_profile_1.default)();
    (0, react_1.useEffect)(() => {
        async function getNostrPubkey() {
            let secretKey = await (0, nostr_1.getSecretKey)();
            if (secretKey)
                setNostrPubkey((0, nostr_tools_1.getPublicKey)(secretKey));
            else
                console.warn("NOSTR SECRET KEY NOT FOUND");
        }
        getNostrPubkey();
    }, []);
    const onChangeLnAddress = (lightningAddress) => {
        setLnAddress(lightningAddress);
        setError(undefined);
    };
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
        var _a, _b, _c, _d, _e;
        const validationResult = validateLightningAddress(lnAddress);
        if (!validationResult.valid) {
            setError(validationResult.error);
            return;
        }
        const { data, errors } = await updateUsername({
            variables: {
                input: {
                    username: lnAddress,
                },
            },
        });
        console.log("Mutation response:", { data, errors }); // Log full response for debugging
        console.log("User update errors:", (_a = data === null || data === void 0 ? void 0 : data.userUpdateUsername) === null || _a === void 0 ? void 0 : _a.errors); // Log the errors array
        updateNostrProfile({
            content: {
                name: lnAddress,
                username: lnAddress,
                lud16: `${lnAddress}@${lnDomain}`,
                nip05: lnAddress,
            },
        });
        (0, nostr_1.setPreferredRelay)();
        if (((_c = (_b = data === null || data === void 0 ? void 0 : data.userUpdateUsername) === null || _b === void 0 ? void 0 : _b.errors) !== null && _c !== void 0 ? _c : []).length > 0) {
            if (((_e = (_d = data === null || data === void 0 ? void 0 : data.userUpdateUsername) === null || _d === void 0 ? void 0 : _d.errors[0]) === null || _e === void 0 ? void 0 : _e.code) === "USERNAME_ERROR") {
                setError(SetAddressError.ADDRESS_UNAVAILABLE);
            }
            else {
                setError(SetAddressError.UNKNOWN_ERROR);
            }
            return;
        }
        dispatch((0, userSlice_1.updateUserData)({ username: lnAddress }));
        toggleModal();
    };
    return (<exports.SetLightningAddressModalUI isVisible={isVisible} toggleModal={toggleModal} error={error} lnAddress={lnAddress} loading={loading} setLnAddress={onChangeLnAddress} onSetLightningAddress={onSetLightningAddress}/>);
};
exports.SetLightningAddressModal = SetLightningAddressModal;
const SetLightningAddressModalUI = ({ isVisible, toggleModal, onSetLightningAddress, lnAddress, setLnAddress, loading, error, }) => {
    const { appConfig: { galoyInstance: { lnAddressHostname, name: bankName }, }, } = (0, hooks_1.useAppConfig)();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    const setLightningAddress = () => {
        onSetLightningAddress();
    };
    let errorMessage = "";
    switch (error) {
        case SetAddressError.TOO_SHORT:
            errorMessage = LL.SetAddressModal.Errors.tooShort();
            break;
        case SetAddressError.TOO_LONG:
            errorMessage = LL.SetAddressModal.Errors.tooLong();
            break;
        case SetAddressError.INVALID_CHARACTER:
            errorMessage = LL.SetAddressModal.Errors.invalidCharacter();
            break;
        case SetAddressError.ADDRESS_UNAVAILABLE:
            errorMessage = LL.SetAddressModal.Errors.addressUnavailable();
            break;
        case SetAddressError.UNKNOWN_ERROR:
            errorMessage = LL.SetAddressModal.Errors.unknownError();
            break;
    }
    return (<custom_modal_1.default title={LL.SetAddressModal.title({ bankName })} minHeight={"50%"} toggleModal={toggleModal} isVisible={isVisible} primaryButtonTitle={LL.SetAddressModal.title({ bankName })} primaryButtonLoading={loading} primaryButtonOnPress={setLightningAddress} primaryButtonDisabled={!lnAddress} body={<react_native_1.View style={styles.bodyStyle}>
          <react_native_1.View style={styles.textInputContainerStyle}>
            <react_native_1.TextInput autoCorrect={false} autoComplete="off" autoCapitalize="none" style={styles.textInputStyle} onChangeText={setLnAddress} value={lnAddress} placeholder={"your-username"} placeholderTextColor={colors.grey3} keyboardType="default"/>
          </react_native_1.View>
          <themed_1.Text style={{ textAlign: "center" }} type={"p1"}>{`${lnAddress || "___"}@${lnAddressHostname}`}</themed_1.Text>
          {errorMessage && <galoy_error_box_1.GaloyErrorBox errorMessage={errorMessage}/>}
          <themed_1.Text type={"p1"} style={styles.centerAlign}>
            {LL.SetAddressModal.receiveMoney({ bankName })}
            <themed_1.Text color={colors.warning} bold={true}>
              {" "}
              {LL.SetAddressModal.itCannotBeChanged()}
            </themed_1.Text>
          </themed_1.Text>
        </react_native_1.View>}/>);
};
exports.SetLightningAddressModalUI = SetLightningAddressModalUI;
const SetAddressError = {
    TOO_SHORT: "TOO_SHORT",
    TOO_LONG: "TOO_LONG",
    INVALID_CHARACTER: "INVALID_CHARACTER",
    ADDRESS_UNAVAILABLE: "ADDRESS_UNAVAILABLE",
    UNKNOWN_ERROR: "UNKNOWN_ERROR",
};
const validateLightningAddress = (lightningAddress) => {
    if (lightningAddress.length < 3) {
        return {
            valid: false,
            error: SetAddressError.TOO_SHORT,
        };
    }
    if (lightningAddress.length > 50) {
        return {
            valid: false,
            error: SetAddressError.TOO_LONG,
        };
    }
    if (!/^[\p{L}0-9_]+$/u.test(lightningAddress)) {
        return {
            valid: false,
            error: SetAddressError.INVALID_CHARACTER,
        };
    }
    return {
        valid: true,
    };
};
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    bodyStyle: {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        alignItems: "stretch",
        rowGap: 20,
    },
    textInputContainerStyle: {
        display: "flex",
        flexDirection: "row",
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        minHeight: 60,
        backgroundColor: colors.grey5,
        alignItems: "center",
        justifyContent: "space-between",
    },
    textInputStyle: {
        paddingTop: 0,
        paddingBottom: 0,
        flex: 1,
        textAlignVertical: "center",
        fontSize: 18,
        lineHeight: 24,
        color: colors.black,
    },
    centerAlign: {
        textAlign: "center",
    },
}));
//# sourceMappingURL=set-lightning-address-modal.js.map