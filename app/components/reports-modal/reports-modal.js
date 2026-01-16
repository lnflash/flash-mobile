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
exports.Reports = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const react_native_date_picker_1 = __importDefault(require("react-native-date-picker"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const native_1 = require("@react-navigation/native");
// assets
const report_svg_1 = __importDefault(require("@app/assets/icons/report.svg"));
const report_dark_svg_1 = __importDefault(require("@app/assets/icons/report-dark.svg"));
exports.Reports = {
    Reconciliation: "reconciliation",
};
const ReportModal = ({ isVisible, toggleModal, from, to, reportsToHide = [], }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const navigation = (0, native_1.useNavigation)();
    const [selectedFrom, setSelectedFrom] = (0, react_1.useState)(new Date(from));
    const [selectedTo, setSelectedTo] = (0, react_1.useState)(new Date(to));
    const [showFromPicker, setShowFromPicker] = (0, react_1.useState)(false);
    const [showToPicker, setShowToPicker] = (0, react_1.useState)(false);
    const [isFromPicked, setIsFromPicked] = (0, react_1.useState)(false);
    const [isToPicked, setIsToPicked] = (0, react_1.useState)(false);
    const handleDatePicker = (picker) => {
        if (picker === "from") {
            setShowFromPicker(true);
        }
        else {
            setShowToPicker(true);
        }
    };
    const handleConfirmDate = (picker, date) => {
        if (picker === "from") {
            setSelectedFrom(date);
            setIsFromPicked(true);
            setShowFromPicker(false);
        }
        else {
            setSelectedTo(date);
            setIsToPicked(true);
            setShowToPicker(false);
        }
    };
    const contactOptionList = [
        {
            name: LL.reports.reconciliation(),
            action: () => {
                toggleModal();
                navigation.navigate("Reconciliation", {
                    from: selectedFrom.toISOString(),
                    to: selectedTo.toISOString(),
                });
            },
            hidden: reportsToHide.includes("Reconciliation"),
        },
    ];
    return (<react_native_modal_1.default isVisible={isVisible} backdropOpacity={0.3} backdropColor={colors.grey3} onBackdropPress={toggleModal} style={styles.modal}>
      <react_native_1.View style={styles.modalContent}>
        <react_native_1.View style={styles.datePickersContainer}>
          <themed_1.Button title={isFromPicked ? selectedFrom.toDateString() : LL.reports.selectFromDate()} onPress={() => handleDatePicker("from")}/>
          <themed_1.Button title={isToPicked ? selectedTo.toDateString() : LL.reports.selectToDate()} onPress={() => handleDatePicker("to")}/>
        </react_native_1.View>

        <react_native_date_picker_1.default modal open={showFromPicker} date={selectedFrom} onConfirm={(date) => handleConfirmDate("from", date)} onCancel={() => setShowFromPicker(false)}/>

        <react_native_date_picker_1.default modal open={showToPicker} date={selectedTo} onConfirm={(date) => handleConfirmDate("to", date)} onCancel={() => setShowToPicker(false)}/>

        {contactOptionList
            .filter((item) => !item.hidden)
            .map((item) => (<themed_1.ListItem key={item.name} bottomDivider onPress={item.action} containerStyle={styles.listItemContainer}>
              {colors.white === "#FFFFFF" ? (<report_svg_1.default width={24} height={24} fill={colors.black}/>) : (<report_dark_svg_1.default width={24} height={24} fill={colors.black}/>)}
              <themed_1.ListItem.Content>
                <themed_1.ListItem.Title style={styles.listItemTitle}>{item.name}</themed_1.ListItem.Title>
              </themed_1.ListItem.Content>
              <themed_1.ListItem.Chevron name={"chevron-forward"} type="ionicon"/>
            </themed_1.ListItem>))}
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.default = ReportModal;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    modal: {
        justifyContent: "flex-end",
        flexGrow: 1,
        marginHorizontal: 0,
        marginVertical: 0,
    },
    modalContent: {
        backgroundColor: colors.white,
        paddingHorizontal: 10,
        paddingBottom: 20,
        paddingTop: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    listItemContainer: {
        backgroundColor: colors.white,
    },
    datePickersContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 20,
    },
    listItemTitle: {
        color: colors.black,
    },
}));
//# sourceMappingURL=reports-modal.js.map