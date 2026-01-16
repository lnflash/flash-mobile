"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsRow = void 0;
const custom_icon_1 = require("@app/components/custom-icon");
const react_1 = __importDefault(require("react"));
const themed_1 = require("@rneui/themed");
const testProps_1 = require("../../utils/testProps");
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        borderColor: colors.grey5,
        backgroundColor: colors.white,
        borderTopWidth: 1,
        borderBottomWidth: 1,
    },
    styleDivider: {
        height: 18,
    },
}));
const SettingsRow = ({ setting }) => {
    var _a, _b, _c, _d;
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    if (setting.hidden) {
        return null;
    }
    let settingColor;
    let settingStyle;
    if (setting === null || setting === void 0 ? void 0 : setting.dangerous) {
        settingColor = setting.greyed ? colors.grey2 : colors.error;
        settingStyle = { color: colors.error };
    }
    else {
        settingColor = setting.greyed ? colors.grey2 : colors.black;
        settingStyle = { color: settingColor };
    }
    return (<react_1.default.Fragment key={`setting-option-${setting.id}`}>
      <themed_1.ListItem onPress={setting.action} disabled={!setting.enabled} containerStyle={styles.container}>
        {!((_a = setting.icon) === null || _a === void 0 ? void 0 : _a.startsWith("custom")) && (<themed_1.Icon name={setting.icon} type="ionicon" color={settingColor}/>)}
        {((_b = setting.icon) === null || _b === void 0 ? void 0 : _b.startsWith("custom")) && (<custom_icon_1.CustomIcon name={setting.icon} color={settingColor}/>)}
        <themed_1.ListItem.Content>
          <themed_1.ListItem.Title {...(0, testProps_1.testProps)(setting.category)} style={settingStyle}>
            <themed_1.Text style={settingStyle}>{setting.category}</themed_1.Text>
          </themed_1.ListItem.Title>
          {setting.subTitleText && (<themed_1.ListItem.Subtitle {...(0, testProps_1.testProps)(setting.subTitleText)} style={settingStyle}>
              <themed_1.Text style={settingStyle}>{setting.subTitleText}</themed_1.Text>
            </themed_1.ListItem.Subtitle>)}
        </themed_1.ListItem.Content>
        {setting.enabled && setting.chevron !== false && (<themed_1.ListItem.Chevron name={(_c = setting.chevronLogo) !== null && _c !== void 0 ? _c : "chevron-forward"} color={setting.chevronColor} size={(_d = setting.chevronSize) !== null && _d !== void 0 ? _d : undefined} type="ionicon"/>)}
      </themed_1.ListItem>
      {setting.styleDivider && (<themed_1.Divider style={styles.styleDivider} color={colors.grey4}/>)}
    </react_1.default.Fragment>);
};
exports.SettingsRow = SettingsRow;
//# sourceMappingURL=settings-row.js.map