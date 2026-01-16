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
exports.MountainHeader = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const mointains_cloud_01_svg_1 = __importDefault(require("./mointains-cloud-01.svg"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    amountContainer: {
        alignItems: "center",
        paddingBottom: 16,
    },
    headerSection: {
        color: colors._white,
        fontSize: 16,
        paddingTop: 18,
    },
    mountainView: {
        alignItems: "center",
    },
    titleSection: {
        color: colors._white,
        fontSize: 24,
        fontWeight: "bold",
        paddingTop: 6,
    },
    topView: {
        marginTop: 80,
    },
}));
const MountainHeader = ({ amount, color }) => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    return (<react_native_1.View style={{ backgroundColor: color }}>
      <react_native_1.View style={styles.topView}>
        <react_native_1.View style={styles.amountContainer}>
          <react_native_1.Text style={styles.headerSection}>{LL.EarnScreen.youEarned()}</react_native_1.Text>
          <react_native_1.Text style={styles.titleSection}>{amount} sats</react_native_1.Text>
        </react_native_1.View>
      </react_native_1.View>
      <react_native_1.View style={styles.mountainView}>
        <mointains_cloud_01_svg_1.default />
      </react_native_1.View>
    </react_native_1.View>);
};
exports.MountainHeader = MountainHeader;
//# sourceMappingURL=mountain-header.js.map