"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportTransactionsToHTML = exports.exportTransactionsToPDF = void 0;
// src/utils/pdfExport.ts
const react_native_html_to_pdf_1 = __importDefault(require("react-native-html-to-pdf"));
const react_native_1 = require("react-native");
const react_native_fs_1 = __importDefault(require("react-native-fs"));
const react_native_share_1 = __importDefault(require("react-native-share"));
const exportTransactionsToPDF = async ({ transactions, from, to, totalAmount, balanceInDisplayCurrency, currencySymbol, }) => {
    const htmlContent = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .date-range { margin-top: 20px; text-align: center; }
          .total { margin-top: 20px; font-size: 20px; font-weight: bold; text-align: right; }
        </style>
      </head>
      <body>
        <h1>Reconciliation Report</h1>
        <p class="date-range">From: ${from} To: ${to}</p>
        <table>
          <tr>
            <th>Date</th>
            <th>Direction</th>
            <th>Amount</th>
          </tr>
          ${transactions
        .map((tx) => `
            <tr key="${tx.id}">
              <td>${tx.displayDate}</td>
              <td>${tx.direction}</td>
              <td>${currencySymbol} ${tx.settlementDisplayAmount}</td>
            </tr>
          `)
        .join("")}
        </table>
        <p class="total">Total: ${currencySymbol} ${totalAmount} ( ~${balanceInDisplayCurrency} )</p>
      </body>
    </html>
  `;
    try {
        const options = {
            html: htmlContent,
            fileName: `Reconciliation-Report`,
            directory: react_native_1.Platform.OS === "ios" ? "Documents" : "Download", // Save in Download on Android
        };
        const file = await react_native_html_to_pdf_1.default.convert(options);
        // Display the file path in a more user-friendly way
        const filePath = react_native_1.Platform.OS === "ios"
            ? `Documents/${options.fileName}.pdf`
            : `Download/${options.fileName}.pdf`;
        console.log("PDF generated:", options.fileName);
        // Provide the user an option to open the file directly
        react_native_1.Alert.alert("Success", `PDF saved to: ${filePath}`, [
            {
                text: "Open",
                onPress: () => openPDF(file.filePath),
            },
            {
                text: "OK",
                style: "cancel",
            },
        ], { cancelable: false });
    }
    catch (error) {
        react_native_1.Alert.alert("Error", "Failed to create PDF");
    }
};
exports.exportTransactionsToPDF = exportTransactionsToPDF;
// Function to export the report as an HTML file
const exportTransactionsToHTML = async ({ transactions, from, to, totalAmount, balanceInDisplayCurrency, currencySymbol, }) => {
    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .date-range { margin-top: 20px; text-align: center; }
            .total { margin-top: 20px; font-size: 20px; font-weight: bold; text-align: right; }
          </style>
        </head>
        <body>
          <h1>Reconciliation Report</h1>
          <p class="date-range">From: ${from} To: ${to}</p>
          <table>
            <tr>
              <th>Date</th>
              <th>Direction</th>
              <th>Amount</th>
            </tr>
            ${transactions
        .map((tx) => `
              <tr key="${tx.id}">
                <td>${tx.displayDate}</td>
                <td>${tx.direction}</td>
                <td>${currencySymbol} ${tx.settlementDisplayAmount}</td>
              </tr>
            `)
        .join("")}
          </table>
          <p class="total">Total: ${currencySymbol} ${totalAmount} ( ~${balanceInDisplayCurrency} )</p>
        </body>
      </html>
    `;
    try {
        const options = {
            html: htmlContent,
            fileName: `Reconciliation-Report`,
            directory: react_native_1.Platform.OS === "ios" ? "Documents" : "Download", // Save in Download on Android
        };
        const filePath = `${react_native_fs_1.default.DocumentDirectoryPath}/Reconciliation-Report.html`;
        const filePathDisplay = react_native_1.Platform.OS === "ios"
            ? `Documents/${options.fileName}.html`
            : `Download/${options.fileName}.html`;
        console.log("HTML generated:", options.fileName);
        // Write the HTML content to a file
        await react_native_fs_1.default.writeFile(filePath, htmlContent, "utf8");
        // Provide the user an option to open the file directly
        react_native_1.Alert.alert("Success", `HTML report saved to: ${filePathDisplay}`, [
            {
                text: "Open",
                onPress: () => openHTML(filePath),
            },
            {
                text: "OK",
                style: "cancel",
            },
        ], { cancelable: false });
    }
    catch (error) {
        react_native_1.Alert.alert("Error", "Failed to create HTML report");
    }
};
exports.exportTransactionsToHTML = exportTransactionsToHTML;
// Function to open the HTML file
const openHTML = async (filePath) => {
    try {
        await react_native_share_1.default.open({
            title: "Open HTML",
            url: `file://${filePath}`,
            type: "text/html",
            failOnCancel: false,
        });
    }
    catch (error) {
        console.error("Failed to open HTML:", error);
    }
};
// Function to open the PDF file
const openPDF = async (filePath) => {
    try {
        await react_native_share_1.default.open({
            title: "Open PDF",
            url: react_native_1.Platform.OS === "ios" ? filePath : `file://${filePath}`,
            type: "application/pdf",
            failOnCancel: false,
        });
    }
    catch (error) {
        console.error("Failed to open PDF:", error);
    }
};
//# sourceMappingURL=pdfExport.js.map