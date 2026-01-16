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
exports.PaymentStatusIndicator = void 0;
const React = __importStar(require("react"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const themed_1 = require("@rneui/themed");
const PaymentStatusIndicator = ({ errs, status }) => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    if (status === "success") {
        return (<>
        <galoy_icon_1.GaloyIcon name={"payment-success"} size={128}/>
        <themed_1.Text type={"p1"} style={styles.successText}>
          {LL.SendBitcoinScreen.success()}
        </themed_1.Text>
      </>);
    }
    if (status === "error") {
        return (<>
        <galoy_icon_1.GaloyIcon name={"payment-error"} size={128}/>
        {errs.map(({ message }, item) => (<themed_1.Text type={"p1"} key={`error-${item}`} style={styles.errorText}>
            {message}
          </themed_1.Text>))}
      </>);
    }
    if (status === "pending") {
        return (<>
        <galoy_icon_1.GaloyIcon name={"payment-pending"} size={128}/>
        <themed_1.Text type={"p1"} style={styles.pendingText}>
          {LL.SendBitcoinScreen.notConfirmed()}
        </themed_1.Text>
      </>);
    }
    return <></>;
};
exports.PaymentStatusIndicator = PaymentStatusIndicator;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    errorText: {
        color: colors.error,
        fontSize: 18,
        textAlign: "center",
    },
    pendingText: {
        textAlign: "center",
    },
    successText: {
        textAlign: "center",
    },
}));
//# sourceMappingURL=payment-status-indicator.js.map