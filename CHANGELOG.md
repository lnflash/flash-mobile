# Changelog

All notable changes to the Flash mobile app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **eCash Wallet Integration** - Full Cashu protocol support with BC-UR QR codes
  - Send and receive eCash tokens via animated QR codes
  - BC-UR (Blockchain Commons Uniform Resource) support for large token transfers
  - Multi-fragment QR code scanning with progress indicators
  - Configurable animation speeds (100ms-1000ms) and fragment sizes (200-800 bytes)
  - Multiple mint support with balance tracking per mint
  - Offline mode with local token caching
  - Automatic token redemption queue with retry logic
  - Support for JSON, URL-encoded, and binary token formats
  - Mint management interface for adding/removing mints
  - Transaction history with pending redemption tracking
  - Error recovery for network failures and invalid tokens

### Technical Implementation

- Added `@gandlaf21/bc-ur@^1.1.12` for BC-UR encoding/decoding
- Created `BCURQRCode` utility class for fragment management
- Enhanced QR scanner to detect and assemble BC-UR fragments
- Implemented background redemption queue with exponential backoff
- Added persistent storage for tokens, transactions, and mint configuration
- Created comprehensive error handling for common failure scenarios

### UI/UX Improvements

- New eCash wallet screen accessible from home screen
- Send screen with animated QR display and speed controls
- Enhanced QR scanner with fragment progress indicator
- Mint management screen in wallet settings
- Offline mode indicator when network unavailable
- Pull-to-refresh for balance updates

### Developer Documentation

- Added comprehensive eCash wallet integration guide
- Created BC-UR migration guide for QR code implementation
- Updated README with feature overview and usage instructions 