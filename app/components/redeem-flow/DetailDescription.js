"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const themed_1 = require("@rneui/themed");
const i18n_react_1 = require("@app/i18n/i18n-react");
// utils
const testProps_1 = require("@app/utils/testProps");
const DetailDescription = ({ defaultDescription, domain }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    return (<>
      {defaultDescription && (<themed_1.Text {...(0, testProps_1.testProps)("description")} style={styles.text}>
          {defaultDescription}
        </themed_1.Text>)}
      <themed_1.Text style={styles.text}>
        {LL.RedeemBitcoinScreen.amountToRedeemFrom({ domain })}
      </themed_1.Text>
    </>);
};
exports.default = DetailDescription;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    text: {
        fontSize: 16,
        textAlign: "center",
    },
}));
//# sourceMappingURL=DetailDescription.js.map