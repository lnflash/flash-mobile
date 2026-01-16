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
exports.LevelContainer = void 0;
const client_1 = require("@apollo/client");
const React = __importStar(require("react"));
const generated_1 = require("./generated");
const is_authed_context_1 = require("./is-authed-context");
const level_context_1 = require("./level-context");
(0, client_1.gql) `
  query network {
    globals {
      network
    }
  }

  query level {
    me {
      id
      defaultAccount {
        id
        level
      }
    }
  }
`;
const LevelContainer = ({ children }) => {
    var _a, _b;
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const isAtLeastLevelZero = isAuthed;
    const { data } = (0, generated_1.useLevelQuery)({ fetchPolicy: "cache-only" });
    const level = (_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.level;
    const isAtLeastLevelOne = level === "ONE" || level === "TWO" || level === "THREE";
    const currentLevel = isAuthed && level ? level : "NonAuth";
    return (<level_context_1.LevelContextProvider value={{ isAtLeastLevelZero, isAtLeastLevelOne, currentLevel }}>
      {children}
    </level_context_1.LevelContextProvider>);
};
exports.LevelContainer = LevelContainer;
//# sourceMappingURL=level-component.js.map