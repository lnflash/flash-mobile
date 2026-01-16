"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerateReportsSetting = void 0;
const react_1 = require("react");
const reports_modal_1 = __importDefault(require("@app/components/reports-modal/reports-modal"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const row_1 = require("../row");
const GenerateReportsSetting = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [isModalVisible, setIsModalVisible] = (0, react_1.useState)(false);
    const toggleModal = () => setIsModalVisible((x) => !x);
    const from = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    const to = new Date(new Date().setHours(23, 59, 59, 999)).getTime();
    return (<>
      <row_1.SettingsRow title={LL.reports.title()} leftIcon="download-outline" rightIcon={null} action={toggleModal}/>
      <reports_modal_1.default isVisible={isModalVisible} toggleModal={toggleModal} from={from} to={to} reportsToHide={[]}/>
    </>);
};
exports.GenerateReportsSetting = GenerateReportsSetting;
//# sourceMappingURL=generate-reports.js.map