# Implementation Plan: Transaction Parser

## Overview

This implementation plan creates a dedicated transaction parser module that efficiently extracts memo and amount data from incoming Stellar transactions. The parser will replace the embedded parsing logic in `stellarService.js` with a focused, reusable component that provides consistent data extraction, validation, and error handling.

## Tasks

- [x] 1. Set up transaction parser module structure
  - Create `src/services/transactionParser.js` as the main parser module
  - Create `src/services/parsers/memoExtractor.js` for memo handling
  - Create `src/services/parsers/amountExtractor.js` for amount parsing
  - Define core interfaces and error types
  - _Requirements: 6.1, 6.2_

- [ ] 2. Implement memo extraction functionality
  - [ ] 2.1 Create memo extraction core logic
    - Implement `extractMemo()` function to handle all Stellar memo types
    - Support MEMO_TEXT, MEMO_ID, MEMO_HASH, and MEMO_RETURN types
    - Handle missing memo fields gracefully
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 2.2 Write property test for memo extraction
    - **Property 1: Memo extraction handles all types correctly**
    - **Validates: Requirements 1.1, 1.3, 1.4**

  - [ ] 2.3 Implement memo decoding and validation
    - Add support for base64 and hex encoded memo content
    - Implement memo format validation for payment references
    - Add error handling for malformed memo data
    - _Requirements: 1.3, 1.5, 3.1_

- [ ] 3. Implement amount extraction functionality
  - [ ] 3.1 Create amount normalization logic
    - Implement `normalizeAmount()` function with 7-decimal precision
    - Preserve original precision without rounding or truncation
    - Handle edge cases and invalid amount formats
    - _Requirements: 2.1, 2.4, 2.5_

  - [ ]* 3.2 Write property test for amount precision
    - **Property 2: Amount extraction preserves precision across operations**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [ ] 3.3 Implement multi-operation amount extraction
    - Extract amounts from multiple payment operations in a transaction
    - Handle path payment operations with source and destination amounts
    - Support different operation types (payment, path_payment, account_merge)
    - _Requirements: 2.2, 2.3, 4.1, 4.2, 4.3_

- [ ] 4. Implement asset detection and validation
  - [ ] 4.1 Create asset detection logic
    - Move `detectAsset()` function from stellarService to parser
    - Validate asset codes and issuer information
    - Handle native and credit assets consistently
    - _Requirements: 3.3, 4.5_

  - [ ]* 4.2 Write property test for validation
    - **Property 3: Validation is comprehensive and deterministic**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

- [ ] 5. Implement main parser interface
  - [ ] 5.1 Create `parseTransaction()` main function
    - Combine memo, amount, and asset extraction into unified interface
    - Generate consistent ParsedTransaction output structure
    - Include transaction metadata (hash, ledger, timestamps)
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 5.2 Write property test for output structure
    - **Property 4: Output structure is consistent and complete**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [ ] 5.3 Add parsing metadata and versioning
    - Include parser version, parse timestamp, and processing time
    - Ensure output is JSON serializable
    - Add transaction type identification
    - _Requirements: 6.4, 6.5, 4.5_

- [ ]* 5.4 Write property test for JSON serialization
  - **Property 5: JSON serialization round-trip preserves data**
  - **Validates: Requirements 6.5**

- [ ] 6. Implement comprehensive error handling
  - [ ] 6.1 Create structured error types
    - Define `TransactionParseError` class with error codes
    - Implement graceful handling of malformed transactions
    - Add timeout protection for parsing operations
    - _Requirements: 7.1, 7.4_

  - [ ]* 6.2 Write property test for error handling
    - **Property 6: Error handling is graceful and non-destructive**
    - **Validates: Requirements 1.5, 2.5, 7.1, 7.2, 7.3**

  - [ ] 6.3 Add validation and sanitization
    - Validate parsed data against business rules
    - Sanitize invalid memo characters and encoding
    - Flag suspicious amounts while continuing processing
    - _Requirements: 3.4, 3.5, 7.2, 7.3_

- [ ] 7. Optimize for performance requirements
  - [ ] 7.1 Implement performance optimizations
    - Minimize memory allocation during parsing
    - Avoid unnecessary data copying and transformations
    - Add efficient error handling that doesn't impact successful operations
    - _Requirements: 5.2, 5.4, 5.5_

  - [ ]* 7.2 Write property test for performance
    - **Property 7: Performance bounds are maintained**
    - **Validates: Requirements 5.1, 5.3**

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Integrate parser with existing services
  - [ ] 9.1 Update stellarService to use new parser
    - Replace embedded parsing logic in `extractValidPayment()`
    - Update `verifyTransaction()` to use parser interface
    - Maintain backward compatibility with existing API
    - _Requirements: All requirements via integration_

  - [ ]* 9.2 Write integration tests
    - Test parser integration with stellarService
    - Verify backward compatibility with existing functionality
    - Test error propagation and handling

- [ ] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The parser is designed to be a pure function without side effects
- Performance target is sub-10ms parsing on standard hardware