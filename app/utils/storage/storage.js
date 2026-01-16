"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clear = exports.remove = exports.save = exports.loadJson = exports.saveJson = exports.saveString = exports.loadString = void 0;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
/**
 * Loads a string from storage.
 *
 * @param key The key to fetch.
 */
const loadString = async (key) => {
    try {
        return await async_storage_1.default.getItem(key);
    }
    catch (_a) {
        // not sure why this would fail... even reading the RN docs I'm unclear
        return null;
    }
};
exports.loadString = loadString;
/**
 * Saves a string to storage.
 *
 * @param key The key to fetch.
 * @param value The value to store.
 */
const saveString = async (key, value) => {
    try {
        await async_storage_1.default.setItem(key, value);
        return true;
    }
    catch (_a) {
        return false;
    }
};
exports.saveString = saveString;
const saveJson = async (key, value) => {
    try {
        await async_storage_1.default.setItem(key, JSON.stringify(value));
        return true;
    }
    catch (_a) {
        return false;
    }
};
exports.saveJson = saveJson;
/**
 * Loads something from storage and runs it thru JSON.parse.
 *
 * @param key The key to fetch.
 */
const loadJson = async (key) => {
    try {
        const data = await async_storage_1.default.getItem(key);
        return data ? JSON.parse(data) : null;
    }
    catch (_a) {
        return null;
    }
};
exports.loadJson = loadJson;
/**
 * Saves an object to storage.
 *
 * @param key The key to fetch.
 * @param value The value to store.
 */
const save = async (key, value) => {
    try {
        await async_storage_1.default.setItem(key, JSON.stringify(value));
        return true;
    }
    catch (_a) {
        return false;
    }
};
exports.save = save;
/**
 * Removes something from storage.
 *
 * @param key The key to kill.
 */
const remove = async (key) => {
    try {
        await async_storage_1.default.removeItem(key);
    }
    catch (err) {
        console.error(err);
    }
};
exports.remove = remove;
/**
 * Burn it all to the ground.
 */
const clear = async () => {
    try {
        await async_storage_1.default.clear();
    }
    catch (err) {
        console.error(err);
    }
};
exports.clear = clear;
//# sourceMappingURL=storage.js.map