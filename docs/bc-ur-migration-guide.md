# BC-UR QR Code Migration Guide

This guide explains how to migrate from standard QR codes to BC-UR (Blockchain Commons Uniform Resource) encoded QR codes for improved reliability when transferring large data payloads.

## Why BC-UR?

Standard QR codes have size limitations that make them impractical for large data payloads. BC-UR solves this by:
- Splitting large data into multiple QR code fragments
- Enabling reliable reconstruction even if some fragments are missed
- Providing progress feedback during scanning
- Supporting various fragment sizes for different use cases

## Installation

```bash
yarn add @gandlaf21/bc-ur@^1.1.12
```

## Basic Implementation

### 1. Create the BC-UR Utility Module

```typescript
// utils/qr/bcur.ts
import { UR, UREncoder, URDecoder } from "@gandlaf21/bc-ur"
import { Buffer } from "buffer"

export class BCURQRCode {
  static encodeToken(tokenString: string, config?: BCURConfig) {
    const messageBuffer = Buffer.from(tokenString, 'base64')
    const ur = UR.fromBuffer(messageBuffer)
    const encoder = new UREncoder(ur, fragmentLength)
    
    // Return controller object for QR generation
    return {
      start: (onUpdate: (fragment: string) => void) => {
        const interval = setInterval(() => {
          const fragment = encoder.nextPart()
          onUpdate(fragment)
        }, fragmentInterval)
      },
      // ... other methods
    }
  }
  
  static createDecoder() {
    const decoder = new URDecoder()
    return {
      receivePart: (fragment: string) => {
        decoder.receivePart(fragment)
      },
      isComplete: () => decoder.isComplete(),
      getDecodedToken: () => {
        const ur = decoder.resultUR()
        const buffer = ur.decodeCBOR()
        return buffer.toString('base64')
      }
    }
  }
}
```

### 2. Update QR Display Component

```typescript
// components/QRDisplay.tsx
import { BCURQRCode } from '@/utils/qr/bcur'
import QRCode from 'react-native-qrcode-svg'

export const AnimatedQRDisplay = ({ data }: { data: string }) => {
  const [qrValue, setQrValue] = useState('')
  const encoderRef = useRef<BCUREncoder | null>(null)
  
  useEffect(() => {
    const encoder = BCURQRCode.encodeToken(data, {
      fragmentLength: 200,
      fragmentInterval: 250
    })
    
    encoderRef.current = encoder
    encoder.start((fragment) => setQrValue(fragment))
    
    return () => encoder.stop()
  }, [data])
  
  return <QRCode value={qrValue} size={300} />
}
```

### 3. Update QR Scanner Component

```typescript
// components/QRScanner.tsx
import { BCURQRCode } from '@/utils/qr/bcur'

export const BCURScanner = ({ onScan }: { onScan: (data: string) => void }) => {
  const [decoder] = useState(() => BCURQRCode.createDecoder())
  const [progress, setProgress] = useState(null)
  
  const handleCodeScanned = (code: string) => {
    if (BCURQRCode.isValidFragment(code)) {
      decoder.receivePart(code)
      setProgress(decoder.getProgress())
      
      if (decoder.isComplete()) {
        const token = decoder.getDecodedToken()
        onScan(token)
        decoder.reset()
      }
    } else {
      // Handle regular QR codes
      onScan(code)
    }
  }
  
  return (
    <>
      <Camera onCodeScanned={handleCodeScanned} />
      {progress && (
        <Text>
          Scanning: {progress.receivedPartCount}/{progress.expectedPartCount}
        </Text>
      )}
    </>
  )
}
```

## Configuration Options

### Fragment Sizes

Choose based on your use case:
- **200 bytes**: Maximum compatibility, slower transfer
- **400 bytes**: Balanced option for most cases
- **800 bytes**: Fast transfer for modern devices

### Animation Speeds

Adjust based on scanning conditions:
- **100ms**: Laboratory conditions only
- **250ms**: Good lighting, steady hands
- **500ms**: Average conditions
- **1000ms**: Poor lighting, shaky hands

## Best Practices

1. **Always provide speed controls** - Let users adjust animation speed
2. **Show progress indicators** - Users need feedback during multi-fragment scans
3. **Handle both BC-UR and regular QR codes** - Maintain backward compatibility
4. **Test with real devices** - Simulator testing isn't sufficient for QR scanning
5. **Consider fragment size carefully** - Larger isn't always better

## Common Pitfalls

1. **Not handling cleanup** - Always stop encoders when components unmount
2. **Ignoring error states** - BC-UR operations can fail, handle errors gracefully
3. **Fixed configuration** - Different devices/conditions need different settings
4. **Missing progress feedback** - Users will think scanning is broken without feedback

## Testing Recommendations

1. Test with various lighting conditions
2. Test with different camera qualities
3. Test with shaky hands/movement
4. Test fragment loss recovery
5. Test with maximum data sizes

## Performance Considerations

- BC-UR encoding/decoding is CPU intensive
- Consider debouncing rapid scans
- Cache decoded results when appropriate
- Monitor memory usage with large payloads

## Example: Migrating Existing QR Code

### Before (Standard QR):
```typescript
<QRCode value={largeDataString} size={300} />
```

### After (BC-UR):
```typescript
const [qr, setQr] = useState('')
const encoder = BCURQRCode.encodeToken(largeDataString)
encoder.start(setQr)
return <QRCode value={qr} size={300} />
```

## Troubleshooting

### Scanner not detecting fragments
- Check if fragments start with "ur:"
- Verify camera permissions
- Ensure adequate lighting

### Fragments not assembling
- Check decoder state management
- Verify all fragments are from same message
- Look for timeout issues

### Performance issues
- Reduce fragment size
- Increase animation interval
- Profile encoder/decoder operations 