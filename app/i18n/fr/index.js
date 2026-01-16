"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const en_1 = __importDefault(require("../en"));
const fr_json_1 = __importDefault(require("../raw-i18n/translations/fr.json"));
const lodash_merge_1 = __importDefault(require("lodash.merge"));
const translated = (0, lodash_merge_1.default)({}, en_1.default, fr_json_1.default);
exports.default = translated;
//# sourceMappingURL=index.js.map