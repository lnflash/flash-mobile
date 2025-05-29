# eCash Wallet Integration Documentation

## Overview

The Flash mobile app includes a fully integrated Cashu eCash wallet that enables users to send and receive eCash tokens via QR codes. The implementation uses the BC-UR (Blockchain Commons Uniform Resource) standard for reliable QR code-based token transfer, supporting both small single-frame and large multi-fragment tokens.

## Architecture

### Core Components

1. **CashuService** (`app/services/ecash/cashu-service.ts`)
   - Singleton service managing all eCash wallet operations
   - Handles token generation, redemption, and balance management
   - Integrates with the `@cashu/cashu-ts` library for protocol operations

2. **BC-UR QR Code Utility** (`app/utils/qr/bcur.ts`)
   - Encodes tokens into BC-UR fragments for QR display
   - Decodes BC-UR fragments back into tokens
   - Configurable fragment length and animation intervals

3. **Token Decoder** (`app/services/ecash/token-decoder.ts`)
   - Detects and decodes various Cashu token formats
   - Supports JSON, URL-encoded, and binary token formats
   - Handles base64 encoded tokens from BC-UR

4. **Redemption Queue** (`app/services/ecash/redemption-queue.ts`)
   - Background processing queue for token redemption
   - Automatic retry logic with exponential backoff
   - Handles network failures gracefully

5. **Mint Management Service** (`app/services/ecash/mint-management.ts`)
   - Manages multiple Cashu mint connections
   - Stores mint URLs, names, and active status
   - Tracks default mint selection

### UI Components

1. **Main Wallet Screen** (`app/screens/ecash-wallet/main-screen.tsx`)
   - Displays balance and transaction history
   - Shows pending redemptions with retry options
   - Offline mode indicator

2. **Send eCash Screen** (`app/screens/ecash-wallet/send-ecash-screen.tsx`)
   - Token generation interface
   - Animated BC-UR QR code display
   - Speed and fragment size controls

3. **QR Scanner Enhancement** (`app/components/scan/QRCamera.tsx`)
   - BC-UR fragment detection and assembly
   - Progress indicator for multi-fragment scanning
   - Seamless handling of both regular and BC-UR QR codes

## BC-UR Implementation

### Encoding Process

```typescript
// Token generation flow
1. Generate Cashu token using CashuService.sendToken()
2. Encode token as base64 string
3. Create BC-UR encoder with configurable parameters:
   - Fragment length: 200, 400, or 800 bytes
   - Fragment interval: 100, 250, 500, or 1000ms
4. Display animated QR code cycling through fragments
```

### Decoding Process

```typescript
// Token scanning flow
1. QR scanner detects BC-UR fragment (starts with "ur:")
2. BCURDecoder receives and accumulates fragments
3. Progress displayed: X/Y fragments received
4. On completion, extract base64 token
5. Decode and process Cashu token
```

### Fragment Configuration

- **Fragment Lengths**: 
  - 200 bytes: Best for older/slower devices
  - 400 bytes: Balanced option (default)
  - 800 bytes: Faster transfer for capable devices

- **Animation Speeds**:
  - 100ms: Very fast (may be hard to scan)
  - 250ms: Fast (default)
  - 500ms: Medium
  - 1000ms: Slow (best for difficult conditions)

## Token Format Support

The implementation supports multiple Cashu token formats:

1. **JSON Format**: Standard Cashu token with explicit structure
2. **URL-encoded Format**: NUT-08 specification tokens
3. **Binary Format**: Tokens starting with "B" or "Bo"
4. **Base64 Encoded**: Tokens encoded for BC-UR transport

## Data Persistence

- **Tokens**: Stored in AsyncStorage as `cashu_tokens`
- **Transactions**: Stored in AsyncStorage as `cashu_transactions`
- **Mint Configuration**: Stored in AsyncStorage as `cashu_mints`
- **Redemption Queue**: Stored in AsyncStorage as `cashu_redemption_queue`

## Error Handling

### Common Error Scenarios

1. **Already Redeemed Tokens**
   - Clear error message to user
   - Automatic cleanup from pending queue
   - No balance impact

2. **Network Failures**
   - Tokens queued for later redemption
   - Automatic retry with exponential backoff
   - Offline mode with cached data

3. **Unknown Mint**
   - User prompted to select correct mint
   - Mint auto-discovery from token data
   - Fallback to default mint

4. **Invalid Token Format**
   - Graceful error messages
   - Detailed logging for debugging
   - No app crashes

## Security Considerations

1. **Token Storage**: Tokens are stored locally in encrypted AsyncStorage
2. **Mint Connections**: HTTPS required for all mint URLs
3. **Duplicate Prevention**: Token IDs tracked to prevent double-spending
4. **Error Sanitization**: Sensitive data removed from user-facing errors

## Testing

### Manual Testing Checklist

- [ ] Generate token of various amounts
- [ ] Scan single-frame QR codes
- [ ] Scan multi-fragment BC-UR codes
- [ ] Test different animation speeds
- [ ] Test offline mode functionality
- [ ] Verify mint management operations
- [ ] Test error scenarios (network failure, invalid tokens)

### Integration Points

The eCash wallet integrates with:
- Main QR scanner (`ScanningQRCodeScreen`)
- Navigation system (React Navigation)
- Persistent state management
- Theme system for consistent UI

## Future Enhancements

1. **Token Backup**: Export/import token backups
2. **Multi-mint Swaps**: Convert tokens between mints
3. **Payment Requests**: Generate eCash payment requests
4. **NFC Support**: Tap-to-pay with eCash tokens
5. **Advanced Privacy**: Coin selection and mixing

## Troubleshooting

### Common Issues

1. **QR Code Not Scanning**
   - Ensure good lighting conditions
   - Try adjusting animation speed
   - Check camera permissions

2. **Token Redemption Failing**
   - Verify internet connection
   - Check mint availability
   - Try manual mint selection

3. **Balance Not Updating**
   - Pull to refresh the wallet screen
   - Check pending redemptions
   - Verify mint connection

### Debug Mode

Enable debug logging by setting:
```javascript
console.log("ECASH_DEBUG", true)
```

This will output detailed logs for:
- Token encoding/decoding
- Mint communications
- Queue operations
- Balance calculations 