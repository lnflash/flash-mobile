# eCash Wallet API Reference

## CashuService

Singleton service for managing eCash wallet operations.

### Methods

#### `getInstance(): CashuService`
Returns the singleton instance of the CashuService.

#### `initializeWallet(): Promise<void>`
Initializes the wallet, loading tokens and transactions from storage.

#### `getBalance(): Promise<number>`
Returns the total balance across all mints in satoshis.

#### `getMintBalances(): Promise<Record<string, number>>`
Returns balances for each individual mint.

#### `sendToken(amount: number): Promise<{ success: boolean; token?: string; error?: string }>`
Generates a Cashu token for sending.
- `amount`: Amount in satoshis to send
- Returns: Base64 encoded token string ready for BC-UR encoding

#### `receiveToken(tokenString: string): Promise<{ success: boolean; amount?: number; error?: string; isPending?: boolean }>`
Receives and processes a Cashu token.
- `tokenString`: The token to receive (supports base64, JSON, URL-encoded, and binary formats)
- Returns: Success status and amount if determinable

#### `getTransactions(): Promise<CashuTransaction[]>`
Returns all transactions including pending redemptions.

#### `getAllMints(): Promise<MintInfo[]>`
Returns all configured mints (active and inactive).

#### `addMint(url: string, name?: string, setAsDefault?: boolean): Promise<MintInfo>`
Adds a new mint to the wallet.

#### `removeMint(url: string): Promise<void>`
Removes a mint from the wallet.

#### `setDefaultMint(url: string): Promise<void>`
Sets a mint as the default for sending tokens.

## BCURQRCode

Utility class for BC-UR QR code operations.

### Methods

#### `encodeToken(tokenString: string, config?: BCURConfig): BCUREncoder`
Creates a BC-UR encoder for animated QR display.
- `tokenString`: Base64 encoded token data
- `config`: Optional configuration for fragment length and interval
- Returns: Encoder controller object

#### `createDecoder(): BCURDecoder`
Creates a BC-UR decoder for scanning fragments.
- Returns: Decoder object for processing fragments

#### `isValidFragment(fragment: string): boolean`
Checks if a string is a valid BC-UR fragment.
- `fragment`: The string to validate
- Returns: True if valid BC-UR fragment

#### `estimateFragmentCount(tokenString: string, fragmentLength?: number): number`
Estimates the number of fragments needed for a token.

### BCUREncoder Interface

```typescript
interface BCUREncoder {
  getCurrentFragment(): string
  start(onUpdate: (fragment: string) => void): void
  stop(): void
  changeSpeed(newInterval: number, onUpdate: (fragment: string) => void): void
  getInfo(): { currentIndex: number; estimatedFragments: number }
}
```

### BCURDecoder Interface

```typescript
interface BCURDecoder {
  receivePart(fragment: string): boolean
  isComplete(): boolean
  getDecodedToken(): string | null
  getProgress(): {
    expectedPartCount: number
    receivedPartCount: number
    percentComplete: number
  }
  reset(): void
}
```

## TokenDecoder

Utility for decoding various Cashu token formats.

### Methods

#### `isCashuToken(data: string): boolean`
Detects if a string is a valid Cashu token.

#### `decodeToken(tokenString: string): { token: DecodedToken; mintConfidence: "high" | "low" | "unknown" } | null`
Decodes a Cashu token and extracts mint information.

#### `estimateAmount(token: DecodedToken): number | undefined`
Estimates the amount from a decoded token.

#### `normalizeTokenString(tokenString: string): string`
Removes protocol prefixes from token strings.

#### `getKnownMints(): string[]`
Returns list of known Cashu mint URLs.

## Types

### CashuTransaction

```typescript
interface CashuTransaction {
  id: string
  amount: string
  status: "sent" | "received" | "converted" | "pending" | "failed"
  createdAt: Date
  description?: string
  error?: string
}
```

### MintInfo

```typescript
interface MintInfo {
  url: string
  name: string
  isDefault: boolean
  isActive: boolean
  addedAt: Date
}
```

### BCURConfig

```typescript
interface BCURConfig {
  fragmentLength?: number  // 200, 400, or 800 bytes
  fragmentInterval?: number // milliseconds between fragments
}
```

### DecodedToken

```typescript
interface DecodedToken {
  mint: string
  encodedProofs: string
  memo?: string
  unit?: string
  v?: number
}
```

## Storage Keys

The following AsyncStorage keys are used:

- `cashu_tokens`: Array of CashuToken objects
- `cashu_transactions`: Array of CashuTransaction objects
- `cashu_mints`: Mint configuration data
- `cashu_redemption_queue`: Pending redemption requests

## Error Codes

Common error messages returned by the API:

- `"Invalid token string"`: Token format not recognized
- `"Insufficient balance"`: Not enough funds for send operation
- `"Token already redeemed"`: Token was previously claimed
- `"Network error"`: Connection to mint failed
- `"Unknown mint"`: Token's mint not in configured list
- `"Failed to generate proofs"`: Mint operation failed

## Usage Examples

### Sending eCash

```typescript
const cashuService = CashuService.getInstance()
const result = await cashuService.sendToken(1000) // 1000 sats

if (result.success && result.token) {
  // Encode for QR display
  const encoder = BCURQRCode.encodeToken(result.token)
  encoder.start((fragment) => {
    // Update QR code display
    setQrValue(fragment)
  })
}
```

### Receiving eCash

```typescript
const decoder = BCURQRCode.createDecoder()

// Process scanned fragments
const handleScan = (fragment: string) => {
  if (BCURQRCode.isValidFragment(fragment)) {
    decoder.receivePart(fragment)
    
    if (decoder.isComplete()) {
      const token = decoder.getDecodedToken()
      const result = await cashuService.receiveToken(token)
      
      if (result.success) {
        console.log(`Received ${result.amount} sats`)
      }
    }
  }
}
```

### Managing Mints

```typescript
// Add a new mint
await cashuService.addMint(
  "https://mint.example.com",
  "Example Mint",
  true // set as default
)

// Get mint balances
const balances = await cashuService.getMintBalances()
console.log(balances)
// { "https://mint1.com": 1000, "https://mint2.com": 500 }
``` 