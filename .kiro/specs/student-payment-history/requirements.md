# Requirements Document

## Introduction

This feature provides an API endpoint to fetch the complete payment history for a specific student within a school context. The query returns all recorded payment records associated with a student, sorted by most recently confirmed, and enriched with local currency conversion data and blockchain explorer links. This enables school administrators and parents to review a student's full payment trail.

## Glossary

- **Payment_History_API**: The backend service responsible for querying and returning payment records per student.
- **Payment**: A recorded Stellar blockchain transaction linked to a student and school, stored in the payments collection.
- **Student**: A registered learner identified by a unique `studentId` within a school.
- **School**: A multi-tenant entity identified by `schoolId`, injected into requests via middleware.
- **confirmedAt**: The timestamp at which a payment was confirmed on the Stellar network.
- **feeValidationStatus**: The result of comparing the paid amount against the required fee (`valid`, `overpaid`, `underpaid`, `unknown`).
- **localCurrency**: The school's configured fiat currency used for amount conversion display.
- **explorerUrl**: A URL linking to the Stellar blockchain explorer for a given transaction hash.

## Requirements

### Requirement 1: Fetch Payment Records by Student

**User Story:** As a school administrator, I want to query all payment records for a specific student, so that I can review the student's complete payment history.

#### Acceptance Criteria

1. WHEN a valid `studentId` and `schoolId` are provided, THE Payment_History_API SHALL return all payment records associated with that student and school, sorted by `confirmedAt` descending.
2. WHEN no payment records exist for the given student, THE Payment_History_API SHALL return an empty array with HTTP status 200.
3. WHEN an invalid `studentId` format is provided (not 3–20 alphanumeric characters, hyphens, or underscores), THE Payment_History_API SHALL return HTTP status 400 with a `VALIDATION_ERROR` code.
4. THE Payment_History_API SHALL scope all queries to the `schoolId` resolved from the request context, ensuring no cross-school data leakage.

### Requirement 2: Payment Record Content

**User Story:** As a school administrator, I want each payment record to include full transaction details, so that I can audit and verify individual payments.

#### Acceptance Criteria

1. THE Payment_History_API SHALL include the following fields in each returned payment record: `studentId`, `txHash`, `amount`, `feeAmount`, `feeValidationStatus`, `excessAmount`, `status`, `memo`, `senderAddress`, `isSuspicious`, `suspicionReason`, `ledger`, `confirmationStatus`, `confirmedAt`, `verifiedAt`, `createdAt`, `updatedAt`.
2. WHEN a transaction hash is present on a payment record, THE Payment_History_API SHALL include an `explorerUrl` field linking to the Stellar blockchain explorer for that transaction.
3. WHEN the school has a configured `localCurrency`, THE Payment_History_API SHALL include a `localCurrency` object on each payment record containing the converted `amount`, `currency`, `rate`, `rateTimestamp`, and `available` fields.
4. IF the currency conversion service is unavailable, THEN THE Payment_History_API SHALL return the payment record with `localCurrency.available` set to `false` and `localCurrency.amount` set to `null`, without failing the request.

### Requirement 3: Query Correctness

**User Story:** As a school administrator, I want the payment history query to return accurate and complete records, so that I can trust the data for financial decisions.

#### Acceptance Criteria

1. THE Payment_History_API SHALL return only payment records where both `studentId` and `schoolId` match the request parameters.
2. WHEN multiple payments exist for a student, THE Payment_History_API SHALL return all of them, not a subset, unless pagination parameters are applied.
3. THE Payment_History_API SHALL return records sorted strictly by `confirmedAt` in descending order (most recent first).
4. FOR ALL payment records returned, the `studentId` field SHALL match the `studentId` path parameter supplied in the request (round-trip correctness).

### Requirement 4: Error Handling

**User Story:** As a developer integrating this API, I want clear error responses for invalid or missing inputs, so that I can handle failures gracefully in the client.

#### Acceptance Criteria

1. IF the `schoolId` cannot be resolved from the request context, THEN THE Payment_History_API SHALL return HTTP status 400 with a descriptive error message.
2. IF an unexpected server error occurs during the database query, THEN THE Payment_History_API SHALL return HTTP status 500 with code `INTERNAL_ERROR` and pass the error to the global error handler.
3. THE Payment_History_API SHALL NOT expose raw database error messages or stack traces in the response body.
