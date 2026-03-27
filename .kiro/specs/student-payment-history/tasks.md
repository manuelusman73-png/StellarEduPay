# Implementation Plan: Student Payment History

## Overview

The endpoint `GET /api/payments/:studentId` already has a partial implementation in `paymentController.js`. The tasks below formalise the contract, close the identified gaps, and add tests to verify correctness properties from the design document.

## Tasks

- [ ] 1. Audit and harden `getStudentPayments` controller
  - Review the existing `getStudentPayments` function in `backend/src/controllers/paymentController.js`
  - Ensure the MongoDB query always includes both `schoolId` (from `req.schoolId`) and `studentId` (from `req.params.studentId`) in the filter
  - Ensure `.sort({ confirmedAt: -1 })` and `.lean()` are applied
  - Ensure the enrichment loop calls `enrichPaymentWithConversion(p, targetCurrency)` for every record
  - Ensure an empty array `[]` is returned with HTTP 200 when no records exist
  - Ensure unexpected errors are forwarded to `next(err)` and not swallowed
  - _Requirements: 1.1, 1.2, 1.4, 3.1, 3.3, 4.2_

  - [ ]* 1.1 Write property test for query correctness and sort order (Property 1)
    - **Property 1: returned records match filter and are sorted by confirmedAt desc**
    - **Validates: Requirements 1.1, 3.3, 3.4**
    - Use `fast-check` to generate random `schoolId`, `studentId`, and N payment documents; mock `Payment.find` to return them; assert every returned record has the correct `studentId` and `schoolId`, and that `confirmedAt` values are non-increasing
    - Tag: `// Feature: student-payment-history, Property 1: returned records match filter and are sorted by confirmedAt desc`
    - Place test in `tests/studentPaymentHistory.test.js`

  - [ ]* 1.2 Write property test for completeness — all N records returned (Property 4)
    - **Property 4: all N inserted payments are returned**
    - **Validates: Requirements 3.2**
    - Generate N random payment records for a student; mock `Payment.find` to return all N; assert `response.length === N`
    - Tag: `// Feature: student-payment-history, Property 4: all N inserted payments are returned`

- [ ] 2. Verify and fix `validateStudentIdParam` middleware wiring on the route
  - Confirm `GET /:studentId` in `backend/src/routes/paymentRoutes.js` has `validateStudentIdParam` in its middleware chain before `getStudentPayments`
  - Confirm the regex `/^[A-Za-z0-9_-]{3,20}$/` in `backend/src/middleware/validate.js` matches the requirement (3–20 alphanumeric, hyphens, underscores)
  - Confirm the middleware returns HTTP 400 with a `VALIDATION_ERROR`-style error body for invalid inputs
  - _Requirements: 1.3_

  - [ ]* 2.1 Write property test for invalid studentId rejection (Property 2)
    - **Property 2: invalid studentId format returns 400 VALIDATION_ERROR**
    - **Validates: Requirements 1.3**
    - Use `fast-check` to generate strings that violate `^[A-Za-z0-9_-]{3,20}$` (too short, too long, illegal characters); assert each produces HTTP 400 with an error body
    - Tag: `// Feature: student-payment-history, Property 2: invalid studentId format returns 400 VALIDATION_ERROR`

- [ ] 3. Verify `resolveSchool` middleware provides school-scoping on the route
  - Confirm `resolveSchool` is applied before `getStudentPayments` in `paymentRoutes.js` (already via `router.use(resolveSchool)`)
  - Confirm the controller always reads `req.schoolId` (not a hardcoded value) for the MongoDB filter
  - _Requirements: 1.4, 3.1, 4.1_

  - [ ]* 3.1 Write property test for cross-school isolation (Property 3)
    - **Property 3: school B payments never appear in school A results**
    - **Validates: Requirements 1.4, 3.1**
    - Generate two distinct `schoolId` values and a shared `studentId`; mock `Payment.find` to return records for both schools; query with school A's context and assert no returned record has `schoolId` equal to school B
    - Tag: `// Feature: student-payment-history, Property 3: school B payments never appear in school A results`

- [ ] 4. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Verify `enrichPaymentWithConversion` produces the required response shape
  - Confirm `enrichPaymentWithConversion` in `backend/src/services/currencyConversionService.js` attaches `explorerUrl` (derived from `transactionHash || txHash`) and a `localCurrency` object with fields `amount`, `currency`, `rate`, `rateTimestamp`, `available`
  - Confirm that when the price feed is unavailable the function returns `localCurrency.available: false` and `localCurrency.amount: null` without throwing
  - Confirm the spread is non-mutating (original payment object is not modified)
  - _Requirements: 2.2, 2.3, 2.4_

  - [ ]* 5.1 Write property test for response shape integrity (Property 5)
    - **Property 5: every returned record has required fields, explorerUrl, and localCurrency**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
    - Generate random payment records (with and without `transactionHash`, with and without currency service available); assert every item in the response has all required fields listed in Requirement 2.1, correct `explorerUrl` behaviour, and a well-formed `localCurrency` object
    - Tag: `// Feature: student-payment-history, Property 5: every returned record has required fields, explorerUrl, and localCurrency`

  - [ ]* 5.2 Write unit tests for `enrichPaymentWithConversion` edge cases
    - Test: payment with `transactionHash` set → `explorerUrl` contains the hash
    - Test: payment with no hash → `explorerUrl` is `null`
    - Test: currency service unavailable (mock `convertToLocalCurrency` to return `available: false`) → `localCurrency.available` is `false`, `localCurrency.amount` is `null`, request still returns 200
    - _Requirements: 2.2, 2.4_

- [ ] 6. Write unit tests for `getStudentPayments` controller
  - Test: student with no payments → response is `[]` with HTTP 200
  - Test: missing `X-School-ID` / `X-School-Slug` header → HTTP 400 `MISSING_SCHOOL_CONTEXT` (handled by `resolveSchool`)
  - Test: `Payment.find` throws → error is passed to `next`, not swallowed, and response does not contain stack traces
  - Place tests in `tests/studentPaymentHistory.test.js`, following the existing Jest + supertest pattern in `tests/payment.test.js`
  - _Requirements: 1.2, 4.1, 4.2, 4.3_

  - [ ]* 6.1 Write property test for no stack traces in error responses (Property 6)
    - **Property 6: error responses contain no stack traces or internal details**
    - **Validates: Requirements 4.3**
    - Generate error scenarios (bad input, mocked DB failure); assert the response body string does not contain `"stack"`, `"at "`, or `"Error:"` patterns
    - Tag: `// Feature: student-payment-history, Property 6: error responses contain no stack traces or internal details`

- [ ] 7. Final checkpoint — Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests use `fast-check` (install with `npm install --save-dev fast-check` in the `backend` directory if not already present)
- All tests follow the existing Jest + supertest pattern in `tests/payment.test.js`
- Each task references specific requirements for traceability
- The endpoint and its middleware chain are already registered; most tasks are hardening and test coverage
