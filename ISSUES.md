# Known Issues - pocket-money-2 Branch

This document tracks known issues and bugs in the pocket-money-2 branch that need to be addressed.

## Critical Issues

### 1. BC-UR Token Scanning - Infinite Loop Processing

**Status:** 🔴 CRITICAL - Unresolved

**Description:**
The BC-UR (Blockchain Commons Uniform Resource) QR code scanning for eCash tokens is stuck in an infinite processing loop. When scanning a BC-UR encoded eCash token:

**Symptoms:**
- Continuous "BC-UR decoding complete, processing token" logs
- Repeated "Preventing duplicate QR code scan" logs 
- "Invalid QR Code" alert appears despite successful BC-UR decoding
- Scanner processes the same fragments repeatedly
- Token redemption fails even though decoding succeeds

**Technical Details:**
- Location: `app/components/scan/QRCamera.tsx`
- BC-UR decoder successfully decodes fragments but fails to properly halt processing
- Debounce mechanism partially working but fragments continue to be processed
- Token gets decoded but then fails validation in `parseDestination()` function
- Issue occurs in the integration between BC-UR decoding and eCash token processing

**Current Workarounds:**
- None - feature is non-functional

**Investigation Needed:**
1. Review BC-UR decoder reset mechanism
2. Check if decoded token format matches expected eCash token format
3. Verify integration between BC-UR decoding and CashuService
4. Examine token validation in scanning pipeline

**Logs Example:**
```
LOG  BC-UR decoding complete, processing token
LOG  Preventing duplicate QR code scan
[repeated many times]
LOG  Loaded from cache: Balance: 0 sats, Transactions: 0
```

---

## Resolved Issues

### 1. Settings Screen Crash ✅

**Status:** 🟢 RESOLVED

**Description:**
Settings screen was crashing with "Cannot read property 'filter' of undefined" error.

**Root Cause:**
Reference to undefined `items.chats` property in SettingsScreen component.

**Fix:**
Changed `items.chats` to `items.experimental` in settings screen group configuration.

**Commit:** `25596ba6` - Fix settings screen crash: change items.chats to items.experimental

---

## Implementation Issues

### 1. eCash Wallet Integration

**Status:** 🟡 NEEDS TESTING

**Description:**
The eCash wallet integration using Cashu protocol appears to be implemented but requires thorough testing.

**Components Involved:**
- `app/services/ecash/cashu-service.ts` - Core Cashu protocol implementation
- `app/screens/ecash-wallet/main-screen.tsx` - Main eCash wallet UI
- `app/components/wallet-overview/wallet-overview.tsx` - Balance display
- `app/navigation/stack-param-lists.ts` - Navigation types

**Testing Required:**
- Token redemption flow
- Balance calculation and display
- Offline support functionality
- Admin menu features
- Mint management
- Transaction history

### 2. BC-UR QR Code Implementation

**Status:** 🔴 BROKEN

**Description:**
BC-UR (Blockchain Commons Uniform Resource) implementation for fragmented QR codes is present but not functioning correctly.

**Files:**
- `app/utils/qr/bcur.ts` - BC-UR encoder/decoder implementation
- `app/components/scan/QRCamera.tsx` - Camera integration
- `docs/bc-ur-migration-guide.md` - Documentation

**Issues:**
- Infinite processing loop (see Critical Issue #1)
- Token format validation failures
- Integration with existing QR scanning pipeline

---

## UI/UX Issues

### 1. Cashu Icon Integration

**Status:** 🟢 WORKING

**Description:**
Cashu icon has been integrated and refined through multiple iterations.

**Changes Made:**
- Icon sizing and rounded corners implemented
- SVG optimization for React Native
- Integration with wallet overview component

### 2. Pocket Money UI Improvements

**Status:** 🟡 NEEDS TESTING

**Description:**
Pocket Money interface has been updated with:
- Removed action buttons
- Added admin menu
- Enhanced offline support
- Improved token redemption UI

**Testing Required:**
- Admin menu functionality
- Offline mode behavior
- Token redemption flow
- Balance display accuracy

---

## Dependencies and Configuration

### 1. Package Dependencies

**Status:** 🟢 RESOLVED

**Description:**
Successfully integrated new dependencies:
- `@cashu/cashu-ts: ^2.4.1` - Cashu protocol implementation
- `@breeztech/react-native-breez-sdk-liquid: ^0.8.3` - Lightning functionality

**Conflicts Resolved:**
- package.json merge conflicts between Cashu and Breez SDK
- yarn.lock dependency resolution
- iOS Podfile.lock updates

### 2. Navigation Integration

**Status:** 🟢 RESOLVED

**Description:**
Successfully merged navigation parameter types for eCash wallet screens.

**Changes:**
- Added eCash wallet route definitions
- Integrated authentication parameters
- Resolved navigation stack conflicts

---

## Testing Recommendations

### Priority 1 - Critical Path Testing
1. **BC-UR Token Scanning** - Fix infinite loop and test complete flow
2. **eCash Token Redemption** - Test with real tokens
3. **Balance Calculation** - Verify accuracy and persistence

### Priority 2 - Feature Testing
1. **Admin Menu Functionality** - Test all admin features
2. **Offline Support** - Test app behavior without network
3. **Mint Management** - Test adding/removing mints

### Priority 3 - Integration Testing
1. **Navigation Flow** - Test all eCash wallet screens
2. **Settings Integration** - Verify all wallet toggles work
3. **Icon Display** - Test across different screen sizes

---

## Development Notes

### Cherry-Pick Process
This branch was created by cherry-picking specific commits from the `pocket-money` branch:
- Core eCash wallet integration
- Cashu service implementation
- UI improvements and icon refinements
- BC-UR scanning functionality
- Transaction management improvements

### Merge Conflicts Resolved
- Navigation parameter types
- Settings screen structure
- Package dependencies
- i18n translation strings
- iOS dependency versions

### Architecture Decisions
- Cashu service implemented as singleton
- BC-UR decoding integrated into existing QR scanning pipeline
- eCash wallet state managed separately from main wallet
- Offline support via local storage and background queue

---

## Next Steps

1. **Fix BC-UR Scanning** - Highest priority, blocks core functionality
2. **Comprehensive Testing** - Test all eCash features end-to-end
3. **Performance Optimization** - Review balance calculation efficiency
4. **User Experience** - Polish UI interactions and error handling
5. **Documentation** - Update user guides and technical documentation

---

## Contact

For technical discussions about these issues, please:
1. Create GitHub issues for specific bugs
2. Review related commits and pull requests
3. Test on both iOS and Android platforms
4. Provide detailed reproduction steps and logs

Last Updated: December 30, 2024
Branch: pocket-money-2