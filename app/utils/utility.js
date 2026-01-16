"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeByTimestamp = void 0;
const mergeByTimestamp = (arr1, arr2) => {
    var _a, _b, _c, _d;
    const mergedArr = [];
    let i = 0;
    let j = 0;
    while (arr1.length != i && arr2.length != j) {
        console.log(((_a = arr1[i]) === null || _a === void 0 ? void 0 : _a.timestamp) > ((_b = arr2[j]) === null || _b === void 0 ? void 0 : _b.timestamp));
        if (((_c = arr1[i]) === null || _c === void 0 ? void 0 : _c.timestamp) > ((_d = arr2[j]) === null || _d === void 0 ? void 0 : _d.timestamp)) {
            mergedArr.push(arr1[i]);
            i++;
        }
        else {
            mergedArr.push(arr2[j]);
            j++;
        }
    }
    while (arr1.length !== i) {
        mergedArr.push(arr1[i]);
        i++;
    }
    while (arr2.length !== j) {
        mergedArr.push(arr2[j]);
        j++;
    }
    return mergedArr;
};
exports.mergeByTimestamp = mergeByTimestamp;
//# sourceMappingURL=utility.js.map