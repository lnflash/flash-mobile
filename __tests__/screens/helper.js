"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextForScreen = void 0;
const testing_1 = require("@apollo/client/testing");
const react_1 = __importDefault(require("react"));
const views_1 = require("../../.storybook/views");
const cache_1 = require("../../app/graphql/cache");
const is_authed_context_1 = require("../../app/graphql/is-authed-context");
const theme_1 = __importDefault(require("@app/rne-theme/theme"));
const native_1 = require("@react-navigation/native");
const themed_1 = require("@rneui/themed");
const mocks_1 = __importDefault(require("@app/graphql/mocks"));
const stack_1 = require("@react-navigation/stack");
const i18n_react_1 = __importDefault(require("@app/i18n/i18n-react"));
const locale_detector_1 = require("@app/utils/locale-detector");
const Stack = (0, stack_1.createStackNavigator)();
const ContextForScreen = ({ children }) => (<themed_1.ThemeProvider theme={theme_1.default}>
    <native_1.NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home">
          {() => (<testing_1.MockedProvider mocks={mocks_1.default} cache={(0, cache_1.createCache)()}>
              <views_1.StoryScreen>
                <i18n_react_1.default locale={(0, locale_detector_1.detectDefaultLocale)()}>
                  <is_authed_context_1.IsAuthedContextProvider value={true}>
                    {children}
                  </is_authed_context_1.IsAuthedContextProvider>
                </i18n_react_1.default>
              </views_1.StoryScreen>
            </testing_1.MockedProvider>)}
        </Stack.Screen>
      </Stack.Navigator>
    </native_1.NavigationContainer>
  </themed_1.ThemeProvider>);
exports.ContextForScreen = ContextForScreen;
//# sourceMappingURL=helper.js.map