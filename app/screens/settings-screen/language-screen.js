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
exports.LanguageScreen = void 0;
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const mapping_1 = require("@app/i18n/mapping");
const locale_detector_1 = require("@app/utils/locale-detector");
const React = __importStar(require("react"));
const screen_1 = require("../../components/screen");
const menu_select_1 = require("@app/components/menu-select");
(0, client_1.gql) `
  query language {
    me {
      id
      language
    }
  }

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
const LanguageScreen = () => {
    var _a;
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data } = (0, generated_1.useLanguageQuery)({
        fetchPolicy: "cache-first",
        skip: !isAuthed,
    });
    const languageFromServer = (0, locale_detector_1.getLanguageFromString)((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.language);
    const [updateLanguage, { loading }] = (0, generated_1.useUserUpdateLanguageMutation)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [newLanguage, setNewLanguage] = React.useState("");
    const handleUpdateLanguage = async (language) => {
        if (loading)
            return;
        await updateLanguage({ variables: { input: { language } } });
        setNewLanguage(language);
    };
    return (<screen_1.Screen preset="scroll">
      <menu_select_1.MenuSelect value={newLanguage || languageFromServer} onChange={handleUpdateLanguage}>
        {locale_detector_1.Languages.map((language) => {
            let languageTranslated;
            if (language === "DEFAULT") {
                languageTranslated = LL.Languages[language]();
            }
            else {
                languageTranslated = mapping_1.LocaleToTranslateLanguageSelector[language];
            }
            return (<menu_select_1.MenuSelectItem key={language} value={language} testPropId={languageTranslated}>
              {languageTranslated}
            </menu_select_1.MenuSelectItem>);
        })}
      </menu_select_1.MenuSelect>
    </screen_1.Screen>);
};
exports.LanguageScreen = LanguageScreen;
//# sourceMappingURL=language-screen.js.map