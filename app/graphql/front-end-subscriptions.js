"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimePriceSubscription = void 0;
const client_1 = require("@apollo/client");
exports.RealtimePriceSubscription = (0, client_1.gql) `
  subscription realtimePriceWs($currency: DisplayCurrency!) {
    realtimePrice(input: { currency: $currency }) {
      errors {
        message
      }
      realtimePrice {
        timestamp
        btcSatPrice {
          base
          offset
        }
        usdCentPrice {
          base
          offset
        }
        denominatorCurrency
      }
    }
  }
`;
//# sourceMappingURL=front-end-subscriptions.js.map