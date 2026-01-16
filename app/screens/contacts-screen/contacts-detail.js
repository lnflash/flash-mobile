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
exports.ContactsDetailScreenJSX = exports.ContactsDetailScreen = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const testProps_1 = require("../../utils/testProps");
const close_cross_1 = require("../../components/close-cross");
const screen_1 = require("../../components/screen");
const contact_transactions_1 = require("./contact-transactions");
const themed_1 = require("@rneui/themed");
const galoy_icon_button_1 = require("@app/components/atomic/galoy-icon-button");
const helper_1 = require("@app/utils/helper");
const ContactsDetailScreen = ({ route }) => {
    const { contact } = route.params;
    return <exports.ContactsDetailScreenJSX contact={contact}/>;
};
exports.ContactsDetailScreen = ContactsDetailScreen;
(0, client_1.gql) `
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
const ContactsDetailScreenJSX = ({ contact, }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const [contactName, setContactName] = React.useState(contact.alias);
    const { LL } = (0, i18n_react_1.useI18nContext)();
    // TODO: feature seems broken. need to fix.
    const [userContactUpdateAlias] = (0, generated_1.useUserContactUpdateAliasMutation)({});
    const updateName = async () => {
        // TODO: need optimistic updates
        // FIXME this one doesn't work
        if (contactName) {
            await userContactUpdateAlias({
                variables: { input: { username: contact.username, alias: contactName } },
            });
        }
    };
    return (<screen_1.Screen unsafe>
      <react_native_1.View style={styles.aliasView}>
        <Ionicons_1.default {...(0, testProps_1.testProps)("contact-detail-icon")} name="person-outline" size={86} color={colors.black}/>
        <react_native_1.View style={styles.inputContainer}>
          <themed_1.Input style={styles.alias} inputStyle={styles.inputStyle} inputContainerStyle={{ borderColor: colors.black }} onChangeText={setContactName} onSubmitEditing={updateName} onBlur={updateName} returnKeyType="done">
            {contact.alias}
          </themed_1.Input>
        </react_native_1.View>
        <themed_1.Text type="p1">{`${LL.common.username()}: ${contact.username}`}</themed_1.Text>
      </react_native_1.View>
      <react_native_1.View style={styles.contactBodyContainer}>
        <react_native_1.View style={styles.transactionsView}>
          <themed_1.Text style={styles.screenTitle}>
            {LL.ContactDetailsScreen.title({
            username: contact.alias || contact.username,
        })}
          </themed_1.Text>
          <contact_transactions_1.ContactTransactions contactUsername={contact.username}/>
        </react_native_1.View>
        <react_native_1.View style={styles.actionsContainer}>
          <galoy_icon_button_1.GaloyIconButton name={"send"} size="large" text={LL.HomeScreen.send()} onPress={() => navigation.navigate("sendBitcoinDestination", {
            username: contact.username,
        })}/>
        </react_native_1.View>
      </react_native_1.View>

      <close_cross_1.CloseCross color={colors.black} onPress={navigation.goBack}/>
    </screen_1.Screen>);
};
exports.ContactsDetailScreenJSX = ContactsDetailScreenJSX;
const useStyles = (0, themed_1.makeStyles)(() => ({
    actionsContainer: {
        margin: 12,
    },
    alias: {
        fontSize: 36,
    },
    aliasView: {
        alignItems: "center",
        paddingBottom: 6,
        paddingTop: helper_1.isIos ? 40 : 10,
    },
    contactBodyContainer: {
        flex: 1,
    },
    inputContainer: {
        flexDirection: "row",
    },
    inputStyle: {
        textAlign: "center",
        textDecorationLine: "underline",
    },
    screenTitle: {
        fontSize: 18,
        marginBottom: 12,
        marginTop: 18,
    },
    transactionsView: {
        flex: 1,
        marginHorizontal: 30,
    },
}));
//# sourceMappingURL=contacts-detail.js.map