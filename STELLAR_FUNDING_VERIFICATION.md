# Stellar Account Funding Verification Implementation

## Overview
This implementation adds verification that Stellar addresses registered for schools are funded (exist on the Stellar network with at least 1 XLM minimum balance) before accepting them. The check is non-blocking to avoid disrupting school setup workflows.

## Changes Made

### 1. New Service: `stellarAccountVerificationService.js`
**Location:** `backend/src/services/stellarAccountVerificationService.js`

Provides the core verification logic:
- **Function:** `verifyStellarAccountFunding(stellarAddress)`
- **Returns:** `{ isFunded: boolean|null, warning: string|null }`
  - `isFunded: true` — Account exists and has ≥1 XLM
  - `isFunded: false` — Account exists but has <1 XLM or doesn't exist
  - `isFunded: null` — Horizon check failed (timeout/network error)
- **Timeout:** 3 seconds (configurable via `HORIZON_CHECK_TIMEOUT_MS`)
- **Non-blocking:** Network failures don't prevent school creation/updates

**Key Features:**
- Calls Horizon's `/accounts/{id}` endpoint to check account existence and balance
- Treats 404 responses as unfunded (account doesn't exist)
- Handles transient errors gracefully (timeouts, connection errors, rate limits)
- Logs warnings for unfunded accounts and errors

### 2. Updated Controller: `schoolController.js`
**Location:** `backend/src/controllers/schoolController.js`

#### POST /api/schools
- Calls `verifyStellarAccountFunding()` after validation
- Returns **202 Accepted** with `warning: "STELLAR_ACCOUNT_UNFUNDED"` if account is unfunded
- Returns **201 Created** if account is funded or Horizon check fails
- School is created regardless of funding status (non-blocking)

#### PATCH /api/schools/:slug
- Only verifies funding if `stellarAddress` is being updated
- Returns **202 Accepted** with warning if address is unfunded
- Returns **200 OK** if address is funded or Horizon check fails
- Skips verification for non-address updates

### 3. Comprehensive Tests

#### Unit Tests: `tests/stellarAccountVerification.test.js`
Tests the verification service with mocked Horizon responses:
- ✅ Funded account (≥1 XLM)
- ✅ Unfunded account (<1 XLM)
- ✅ Account with no native balance (only other assets)
- ✅ Account not found (404)
- ✅ Timeout handling (3-second limit)
- ✅ Network errors (ECONNREFUSED, ETIMEDOUT, etc.)
- ✅ Horizon errors (5xx, 429 rate limit)
- ✅ Multiple balances (finds native balance correctly)

**Result:** 12 tests passing

#### Integration Tests: `tests/schoolFundingVerification.test.js`
Tests the controller endpoints with mocked dependencies:
- ✅ POST returns 201 for funded address
- ✅ POST returns 202 with warning for unfunded address
- ✅ POST returns 201 when Horizon check fails (non-blocking)
- ✅ POST creates school even if Horizon fails
- ✅ PATCH returns 200 for funded address
- ✅ PATCH returns 202 with warning for unfunded address
- ✅ PATCH returns 200 when Horizon check fails
- ✅ PATCH skips verification for non-address updates

**Result:** 8 tests passing

## API Behavior

### Success Responses

**Funded Account:**
```json
HTTP 201 Created
{
  "schoolId": "SCH-1234",
  "name": "Lincoln High",
  "slug": "lincoln-high",
  "stellarAddress": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJVP2FPYY3D3BTYWP2XMWRIN",
  "network": "testnet"
}
```

**Unfunded Account (Warning):**
```json
HTTP 202 Accepted
{
  "schoolId": "SCH-1234",
  "name": "Lincoln High",
  "slug": "lincoln-high",
  "stellarAddress": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  "network": "testnet",
  "warning": "STELLAR_ACCOUNT_UNFUNDED"
}
```

**Horizon Check Failed (Non-blocking):**
```json
HTTP 201 Created
{
  "schoolId": "SCH-1234",
  "name": "Lincoln High",
  "slug": "lincoln-high",
  "stellarAddress": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJVP2FPYY3D3BTYWP2XMWRIN",
  "network": "testnet"
}
```

### Error Responses

**Invalid Stellar Address:**
```json
HTTP 400 Bad Request
{
  "error": "stellarAddress must be a valid Stellar public key (Ed25519)",
  "code": "INVALID_STELLAR_ADDRESS"
}
```

## Acceptance Criteria Met

✅ **POST /api/schools with unfunded address returns 202 with warning field**
- Returns `{ warning: "STELLAR_ACCOUNT_UNFUNDED" }` in response body

✅ **PATCH /api/schools/:slug with unfunded address returns same warning**
- Returns 202 with warning when updating to unfunded address
- Only verifies if stellarAddress is being updated

✅ **Horizon check has 3-second timeout and doesn't block on failure**
- Timeout: `HORIZON_CHECK_TIMEOUT_MS = 3000` (configurable)
- Network failures return `{ isFunded: null, warning: null }`
- School creation/updates proceed regardless

✅ **Unit tests mock Horizon responses for all scenarios**
- Funded, unfunded, and network error scenarios covered
- 12 unit tests passing
- 8 integration tests passing

## Implementation Details

### Error Handling Strategy
1. **Validation errors** (invalid address format) → 400 Bad Request (blocking)
2. **Unfunded accounts** → 202 Accepted with warning (non-blocking)
3. **Horizon timeouts/network errors** → 201/200 OK (non-blocking)
4. **Horizon 404** → Treated as unfunded, returns 202 with warning

### Logging
- **DEBUG:** Funded accounts logged at debug level
- **WARN:** Unfunded accounts and Horizon failures logged at warn level
- Includes account address and balance/error details

### Performance
- Horizon check runs in parallel with school creation (non-blocking)
- 3-second timeout prevents hanging requests
- No database queries added to verification flow

## Files Modified/Created

**New Files:**
- `backend/src/services/stellarAccountVerificationService.js` — Verification service
- `backend/tests/stellarAccountVerification.test.js` — Unit tests
- `backend/tests/schoolFundingVerification.test.js` — Integration tests

**Modified Files:**
- `backend/src/controllers/schoolController.js` — Added verification calls to POST and PATCH

## Testing

Run all tests:
```bash
npm test
```

Run specific test suite:
```bash
npm test -- stellarAccountVerification.test.js
npm test -- schoolFundingVerification.test.js
```

**Test Results:** 20/20 passing ✅
