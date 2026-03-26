# Design Document: Transaction Parser

## Overview

The Transaction Parser is a dedicated module that efficiently extracts and validates data from incoming Stellar blockchain transactions. It replaces the embedded parsing logic currently scattered across `stellarService.js` with a focused, reusable component that handles memo extraction, amount parsing, and data validation. The parser is designed for high performance and reliability, processing transactions in under 10ms while maintaining data accuracy and providing structured error handling.

The parser integrates with the existing StellarEduPay architecture by providing a clean API that the `stellarService` and other components can use for consistent transaction data extraction.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   StellarEduPay Backend                     │
│                                                             │
│  ┌──────────────────┐    ┌─────────────────────────────────┐│
│  │  stellarService  │───►│      transactionParser.js       ││
│  │  .js             │    │                                 ││
│  │                  │    │  parseTransaction(tx, wallet)   ││
│  │  verifyTx()      │    │  extractMemo(tx)               ││
│  │  syncPayments()  │    │  extractAmount(operations)      ││
│  └──────────────────┘    │  validateParsedData(data)      ││
│                          │  detectAsset(payOp)            ││
│  ┌──────────────────┐    └─────────────────────────────────┘│
│  │  Other Services  │                     │                 │
│  │  (future)        │─────────────────────┘                 │
│  └──────────────────┘                                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Stellar Horizon API                        ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

The parser acts as a pure function layer between the Stellar API responses and the business logic, providing consistent data extraction without side effects.

---

## Components and Interfaces

### `transactionParser.js`

Main parser module with the following public API:

```js
/**
 * Parse a complete Stellar transaction and extract relevant payment data
 * @param {object} tx - Stellar transaction object from Horizon API
 * @param {string} targetWallet - Expected destination wallet address
 * @returns {ParsedTransaction|null} Parsed data or null if invalid
 */
function parseTransaction(tx, targetWallet)

/**
 * Extract memo from transaction, handling all Stellar memo types
 * @param {object} tx - Stellar transaction object
 * @returns {string|null} Decoded memo content or null
 */
function extractMemo(tx)

/**
 * Extract payment amounts from transaction operations
 * @param {Array} operations - Transaction operations array
 * @param {string} targetWallet - Expected destination address
 * @returns {Array<PaymentOperation>} Array of relevant payment operations
 */
function extractPaymentOperations(operations, targetWallet)

/**
 * Validate parsed transaction data against business rules
 * @param {ParsedTransaction} data - Parsed transaction data
 * @returns {ValidationResult} Validation result with errors if any
 */
function validateParsedData(data)

/**
 * Detect and validate asset information from payment operation
 * @param {object} payOp - Stellar payment operation
 * @returns {AssetInfo|null} Asset details or null if unsupported
 */
function detectAsset(payOp)
```

### `memoExtractor.js`

Specialized memo handling:

```js
/**
 * Extract memo based on type (TEXT, ID, HASH, RETURN)
 * @param {object} memoData - Raw memo data from transaction
 * @returns {ExtractedMemo} Processed memo with type and content
 */
function extractByType(memoData)

/**
 * Decode base64 or hex encoded memo content
 * @param {string} content - Encoded memo content
 * @param {string} encoding - Encoding type
 * @returns {string} Decoded content
 */
function decodeMemo(content, encoding)
```

### `amountExtractor.js`

Specialized amount parsing:

```js
/**
 * Normalize Stellar amount to consistent decimal precision
 * @param {string} rawAmount - Raw amount from Stellar API
 * @returns {number} Normalized amount with 7 decimal precision
 */
function normalizeAmount(rawAmount)

/**
 * Extract amounts from path payment operations
 * @param {object} pathPayOp - Path payment operation
 * @returns {PathPaymentAmounts} Source and destination amounts
 */
function extractPathPaymentAmounts(pathPayOp)
```

---

## Data Models

### ParsedTransaction

```js
{
  hash: string,                    // Transaction hash
  successful: boolean,             // Transaction success status
  memo: string | null,             // Extracted memo content
  memoType: string | null,         // Stellar memo type
  operations: PaymentOperation[],  // Relevant payment operations
  ledger: number | null,           // Ledger sequence number
  createdAt: string,              // ISO timestamp
  networkFee: number,             // Transaction fee in XLM
  senderAddress: string | null,    // Source account address
  metadata: {
    parserVersion: string,         // Parser version for tracking
    parsedAt: string,             // Parse timestamp
    processingTimeMs: number      // Parse duration
  }
}
```

### PaymentOperation

```js
{
  type: string,                   // 'payment' | 'path_payment_strict_receive' | etc
  amount: number,                 // Normalized amount
  asset: AssetInfo,              // Asset details
  from: string,                  // Sender address
  to: string,                    // Recipient address
  sourceAmount: number | null,   // For path payments
  sourceAsset: AssetInfo | null  // For path payments
}
```

### AssetInfo

```js
{
  code: string,        // 'XLM', 'USDC', etc
  type: string,        // 'native', 'credit_alphanum4', etc
  issuer: string | null, // Asset issuer (null for native)
  displayName: string,   // Human-readable name
  decimals: number      // Decimal precision
}
```

### ExtractedMemo

```js
{
  content: string | null,  // Decoded memo content
  type: string,           // MEMO_TEXT, MEMO_ID, MEMO_HASH, MEMO_RETURN
  raw: any,              // Original memo data
  encoding: string | null // Detected encoding if applicable
}
```

### ValidationResult

```js
{
  valid: boolean,
  errors: ValidationError[],
  warnings: ValidationWarning[]
}
```

### ValidationError

```js
{
  code: string,     // Error code (INVALID_MEMO, UNSUPPORTED_ASSET, etc)
  message: string,  // Human-readable error message
  field: string,    // Field that failed validation
  value: any       // Invalid value
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Memo extraction handles all types correctly

*For any* Stellar transaction with a memo field of any supported type (TEXT, ID, HASH, RETURN), the parser should extract the memo content correctly and handle encoding/decoding appropriately.

**Validates: Requirements 1.1, 1.3, 1.4**

### Property 2: Amount extraction preserves precision across operations

*For any* Stellar transaction with payment operations, the parser should extract amounts with full precision and handle multiple operations correctly, including path payments with both source and destination amounts.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 3: Validation is comprehensive and deterministic

*For any* parsed transaction data, validation should consistently identify invalid memo formats, amounts, and asset information, returning appropriate error indicators with descriptive messages.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

### Property 4: Output structure is consistent and complete

*For any* successfully parsed transaction, the output should have a consistent structure with all required fields (hash, memo, amount, asset info, transaction type) and include parsing metadata, using null for missing optional fields.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

### Property 5: JSON serialization round-trip preserves data

*For any* parsed transaction data, serializing to JSON and deserializing back should produce equivalent data without loss.

**Validates: Requirements 6.5**

### Property 6: Error handling is graceful and non-destructive

*For any* malformed or invalid transaction input, the parser should handle errors gracefully without crashing, return appropriate error results, and never modify the input data.

**Validates: Requirements 1.5, 2.5, 7.1, 7.2, 7.3**

### Property 7: Performance bounds are maintained

*For any* valid Stellar transaction, parsing should complete within 10 milliseconds and maintain consistent performance across batches.

**Validates: Requirements 5.1, 5.3**

---

## Error Handling

### Structured Error Types

```js
class TransactionParseError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TransactionParseError';
    this.code = code;
    this.details = details;
  }
}
```

### Error Codes

- `INVALID_TRANSACTION`: Transaction object is malformed or missing required fields
- `TRANSACTION_FAILED`: Transaction was not successful on Stellar network
- `MISSING_MEMO`: Transaction lacks required memo field
- `INVALID_MEMO_TYPE`: Unsupported or malformed memo type
- `NO_PAYMENT_OPERATIONS`: No relevant payment operations found
- `UNSUPPORTED_ASSET`: Asset type not supported by the system
- `INVALID_AMOUNT`: Amount value is malformed or out of range
- `MALFORMED_OPERATIONS`: Transaction operations array is invalid
- `TIMEOUT_EXCEEDED`: Parsing took longer than allowed threshold

### Error Recovery

- Invalid memo content: Return null memo with warning, continue parsing
- Unsupported asset: Skip operation, continue with other operations
- Malformed amount: Return null for that operation, continue parsing
- Missing operations: Return empty operations array, continue parsing
- Timeout: Throw error immediately to prevent resource exhaustion

---

## Testing Strategy

### Unit Tests

Focus on specific examples and edge cases:
- Parse transaction with each memo type (TEXT, ID, HASH, RETURN)
- Extract amounts from different operation types (payment, path payment)
- Handle missing or null memo fields
- Validate asset detection for supported and unsupported assets
- Process transactions with multiple payment operations
- Handle malformed transaction objects gracefully

### Property-Based Tests

Use **fast-check** (JavaScript property-based testing library) with a minimum of 100 iterations per property.

Each property test is tagged with:
`Feature: transaction-parser, Property N: <property_text>`

- **Property 1** — Generate transactions with random memo content; assert memo round-trip consistency
- **Property 2** — Generate random valid amount strings; assert normalization idempotence  
- **Property 3** — Generate payment operations with consistent asset data; assert deterministic asset detection
- **Property 4** — Generate transactions with random hashes; assert hash preservation in parsed output
- **Property 5** — Generate invalid transaction data; assert validation produces appropriate errors
- **Property 6** — Generate valid transactions; assert parsing completes within time bounds
- **Property 7** — Generate malformed inputs; assert error handling preserves input integrity