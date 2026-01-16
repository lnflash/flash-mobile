# Flash Plugin LNURL Compatibility Fix

## Problem
The Flash plugin's LNURL implementation fails with "failed to fetch lnurl invoice" because:
1. The plugin requires authentication to create invoices
2. The authentication mechanism isn't working properly with the GraphQL client
3. The `lnurl-pay` npm package used by flash-mobile expects standard LNURL responses

## Solutions

### Option 1: Quick Fix in Flash-Mobile (Recommended for now)
Detect BTCPay Flash plugin LNURL endpoints and handle them specially by:
1. Bypassing the standard lnurl-pay flow
2. Making direct HTTP requests with proper headers
3. Handling the authentication differently

### Option 2: Fix Flash Plugin (Better long-term)
Make the Flash plugin's LNURL endpoints work without authentication by:
1. Creating invoices directly without requiring wallet info
2. Using a simplified invoice creation flow for LNURL
3. Or removing custom LNURL implementation and using BTCPay's built-in LNURL

### Option 3: Use BTCPay's Built-in LNURL (Best solution)
Remove the custom LNURL implementation from Flash plugin entirely and rely on BTCPay Server's built-in LNURL support which already works with all wallets.

## Quick Fix Implementation for Flash-Mobile

Add a check in `send-bitcoin-details-screen.tsx` before calling `requestInvoice`:

```typescript
// Check if this is a Flash plugin LNURL from BTCPay
const isFlashPluginLnurl = paymentDetail.destination.includes('/plugins/') && 
                           paymentDetail.destination.includes('/Flash/');

if (isFlashPluginLnurl) {
  // Handle Flash plugin differently
  // Make a direct HTTP request without using lnurl-pay package
  const response = await fetch(lnurlParams.callback, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
    params: {
      amount: utils.toSats(btcAmount.amount) * 1000, // millisats
      comment: paymentDetail.memo
    }
  });
  
  const data = await response.json();
  if (data.status === 'ERROR') {
    throw new Error(data.reason);
  }
  
  const invoice = data.pr;
  // Continue with invoice processing
} else {
  // Use standard lnurl-pay flow for other LNURL endpoints
  const result = await withTimeout(requestInvoice(requestInvoiceParams), 30000);
  const invoice = result.invoice;
}
```

## Why This Works
- Bypasses the `lnurl-pay` package which might have compatibility issues
- Makes a simpler HTTP request that doesn't require special authentication
- Handles the Flash plugin's response format directly

## Testing
1. Generate an LNURL from a flashcard in BTCPay with Flash plugin
2. Scan with flash-mobile
3. Should successfully fetch and pay the invoice