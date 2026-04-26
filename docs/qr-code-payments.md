# QR Code Payment Feature

## Overview

The QR code payment feature allows parents to scan a QR code with their Stellar-compatible mobile wallet to automatically populate payment details, eliminating manual entry errors.

## Implementation

### Stellar Payment URI (SEP-0007)

The QR code encodes a Stellar payment URI following the [SEP-0007 specification](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md):

```
web+stellar:pay?destination=<WALLET_ADDRESS>&amount=<AMOUNT>&memo=<MEMO>&memo_type=TEXT
```

### Components

1. **stellarUri.js** - Utility function to generate SEP-0007 compliant payment URIs
2. **PaymentForm.jsx** - Updated to display QR code after student lookup
3. **qrcode.react** - Library used to render QR codes as SVG

### Features

- Automatically includes wallet address, payment amount, and memo
- Works with both testnet and mainnet
- Supports multiple asset types (XLM, USDC, etc.)
- Displays explanatory text for users
- Responsive design with centered layout

## Usage

1. Parent enters student ID
2. System displays payment instructions including QR code
3. Parent opens Stellar wallet app (e.g., Lobstr, Solar, Freighter)
4. Parent scans QR code
5. Wallet automatically fills in:
   - Destination address
   - Payment amount
   - Memo text
6. Parent confirms and sends payment

## Compatible Wallets

The following Stellar wallets support SEP-0007 payment URIs:

- Lobstr
- Solar Wallet
- Freighter (browser extension with mobile support)
- XBULL Wallet
- Vibrant

## Testing

### Manual Testing

1. Start the frontend: `npm run dev` (in frontend directory)
2. Look up a student with unpaid fees
3. Verify QR code appears below payment instructions
4. Scan with a Stellar wallet app to verify fields are pre-filled

### Automated Testing

Run the unit tests for URI generation:

```bash
cd frontend
npm test -- stellarUri.test.js
```

## Network Compatibility

The QR code works correctly for both:
- **Testnet**: Uses testnet wallet addresses and Horizon URL
- **Mainnet**: Uses mainnet wallet addresses and Horizon URL

The network is determined by the backend configuration (`STELLAR_NETWORK` environment variable).

## Security Considerations

- QR codes are generated client-side from API response data
- No sensitive information is exposed beyond what's already in payment instructions
- Memo encryption (if enabled) is handled server-side before the data reaches the frontend
- URI generation validates required fields to prevent malformed QR codes

## Future Enhancements

- Add download/share QR code functionality
- Support for additional memo types (MEMO_ID, MEMO_HASH)
- Dynamic QR code sizing based on screen size
- Print-friendly QR code format for paper invoices
