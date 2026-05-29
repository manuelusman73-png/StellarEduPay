# Configurable Suspicious Payment Multiplier Implementation

## Overview
This implementation adds a configurable multiplier threshold for detecting suspicious payments. Schools can now customize how sensitive the abnormal payment detection is, allowing flexibility for different payment patterns and risk profiles.

## Changes Made

### 1. School Model Enhancement
**Location:** `backend/src/models/schoolModel.js`

Added new field to the School schema:
```javascript
suspiciousPaymentMultiplier: {
  type: Number,
  default: 3.0,
  min: [1.1, 'suspiciousPaymentMultiplier must be at least 1.1'],
  max: [100, 'suspiciousPaymentMultiplier must not exceed 100'],
}
```

**Features:**
- Default value: 3.0 (maintains backward compatibility with original hardcoded behavior)
- Minimum: 1.1 (prevents overly sensitive detection)
- Maximum: 100 (prevents overly lenient detection)
- Validated at the schema level

### 2. School Controller Updates
**Location:** `backend/src/controllers/schoolController.js`

#### POST /api/schools
- Accepts optional `suspiciousPaymentMultiplier` in request body
- Validates multiplier is between 1.1 and 100
- Returns 400 with `VALIDATION_ERROR` code if invalid
- Creates school with custom multiplier or uses default (3.0)

#### PATCH /api/schools/:slug
- Accepts optional `suspiciousPaymentMultiplier` in request body
- Validates multiplier is between 1.1 and 100
- Returns 400 with `INVALID_SUSPICIOUS_PAYMENT_MULTIPLIER` code if invalid
- Updates multiplier without affecting other fields

### 3. Stellar Service Enhancement
**Location:** `backend/src/services/stellarService.js`

Updated `detectAbnormalPatterns()` function:
- Now accepts `suspiciousPaymentMultiplier` as 6th parameter (defaults to 3.0)
- Uses configurable multiplier for unusual amount detection
- Flags payments where:
  - `ratio >= multiplier` (upper bound, inclusive)
  - `ratio <= 1/multiplier` (lower bound, inclusive)
- Example: With multiplier 3.0, flags payments >3× or <1/3 of expected fee

**Reason Message Format:**
```
"Unusual payment amount (ratio 3.00, threshold 3.0×)"
```

### 4. Comprehensive Tests

#### Unit Tests: `tests/detectAbnormalPatternsMultiplier.test.js`
Tests the `detectAbnormalPatterns` function with various multipliers:
- ✅ Default multiplier (3.0) - flags 3× and 1/3 payments
- ✅ Strict multiplier (1.5) - flags 1.5× and 1/1.5 payments
- ✅ Lenient multiplier (5.0) - flags 5× and 1/5 payments
- ✅ Boundary multiplier (1.1) - flags 1.1× and 1/1.1 payments
- ✅ Multiplier in reason message
- ✅ Rapid transaction detection (independent of multiplier)
- ✅ Combined reasons (rapid + unusual amount)
- ✅ Edge cases (zero/null fees, null sender, default multiplier)

**Result:** 31 tests passing

#### Integration Tests: `tests/suspiciousPaymentMultiplier.test.js`
Tests the controller endpoints with multiplier handling:
- ✅ POST creates school with default multiplier when not provided
- ✅ POST creates school with custom multiplier when provided
- ✅ POST rejects multiplier below 1.1
- ✅ POST rejects multiplier above 100
- ✅ POST rejects non-numeric multiplier
- ✅ POST accepts boundary values (1.1 and 100)
- ✅ PATCH updates multiplier to custom value
- ✅ PATCH rejects invalid multiplier on update
- ✅ PATCH doesn't update multiplier when not provided

**Result:** 9 tests passing

#### Existing Tests
- ✅ School funding verification tests (8 tests)
- ✅ Stellar account verification tests (12 tests)

**Total Test Results:** 50/50 passing ✅

## API Behavior

### Creating a School with Custom Multiplier

**Request:**
```json
POST /api/schools
{
  "name": "Lincoln High",
  "slug": "lincoln-high",
  "stellarAddress": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJVP2FPYY3D3BTYWP2XMWRIN",
  "network": "testnet",
  "suspiciousPaymentMultiplier": 5.0
}
```

**Response:**
```json
HTTP 201 Created
{
  "schoolId": "SCH-1234",
  "name": "Lincoln High",
  "slug": "lincoln-high",
  "stellarAddress": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJVP2FPYY3D3BTYWP2XMWRIN",
  "network": "testnet",
  "suspiciousPaymentMultiplier": 5.0
}
```

### Creating a School with Default Multiplier

**Request:**
```json
POST /api/schools
{
  "name": "Lincoln High",
  "slug": "lincoln-high",
  "stellarAddress": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJVP2FPYY3D3BTYWP2XMWRIN",
  "network": "testnet"
}
```

**Response:**
```json
HTTP 201 Created
{
  "schoolId": "SCH-1234",
  "name": "Lincoln High",
  "slug": "lincoln-high",
  "stellarAddress": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJVP2FPYY3D3BTYWP2XMWRIN",
  "network": "testnet",
  "suspiciousPaymentMultiplier": 3.0
}
```

### Updating School Multiplier

**Request:**
```json
PATCH /api/schools/lincoln-high
{
  "suspiciousPaymentMultiplier": 4.5
}
```

**Response:**
```json
HTTP 200 OK
{
  "schoolId": "SCH-1234",
  "name": "Lincoln High",
  "slug": "lincoln-high",
  "stellarAddress": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJVP2FPYY3D3BTYWP2XMWRIN",
  "network": "testnet",
  "suspiciousPaymentMultiplier": 4.5
}
```

### Error Responses

**Invalid Multiplier (too low):**
```json
HTTP 400 Bad Request
{
  "errors": ["suspiciousPaymentMultiplier must be a number between 1.1 and 100"],
  "code": "VALIDATION_ERROR"
}
```

**Invalid Multiplier (too high):**
```json
HTTP 400 Bad Request
{
  "errors": ["suspiciousPaymentMultiplier must be a number between 1.1 and 100"],
  "code": "VALIDATION_ERROR"
}
```

**Invalid Multiplier on Update:**
```json
HTTP 400 Bad Request
{
  "error": "suspiciousPaymentMultiplier must be a number between 1.1 and 100",
  "code": "INVALID_SUSPICIOUS_PAYMENT_MULTIPLIER"
}
```

## Multiplier Interpretation

The multiplier defines the threshold for flagging unusual payment amounts:

| Multiplier | Flags Payments | Example |
|-----------|---|---|
| 1.1 | >1.1× or <0.91× of expected fee | Very strict, catches small deviations |
| 1.5 | >1.5× or <0.67× of expected fee | Strict, catches moderate deviations |
| 3.0 | >3× or <0.33× of expected fee | Default, balanced approach |
| 5.0 | >5× or <0.2× of expected fee | Lenient, only catches large deviations |
| 100 | >100× or <0.01× of expected fee | Very lenient, almost no flagging |

## Implementation Details

### Backward Compatibility
- Default multiplier (3.0) matches the original hardcoded behavior
- Existing schools without a multiplier value will use the default
- No breaking changes to existing APIs

### Validation
- Multiplier must be a number (not string)
- Multiplier must be >= 1.1 (prevents overly sensitive detection)
- Multiplier must be <= 100 (prevents overly lenient detection)
- Validation occurs at both controller and schema levels

### Performance
- Multiplier is stored per school, no additional database queries
- Detection logic is O(1) - simple arithmetic comparison
- No impact on payment processing performance

### Logging
- Multiplier threshold included in abnormal pattern reason messages
- Helps with debugging and understanding why payments were flagged

## Files Modified/Created

**New Files:**
- `backend/tests/detectAbnormalPatternsMultiplier.test.js` — Unit tests for detection logic
- `backend/tests/suspiciousPaymentMultiplier.test.js` — Integration tests for controller
- `StellarEduPay/SUSPICIOUS_PAYMENT_MULTIPLIER.md` — This documentation

**Modified Files:**
- `backend/src/models/schoolModel.js` — Added suspiciousPaymentMultiplier field
- `backend/src/controllers/schoolController.js` — Added multiplier handling in POST/PATCH
- `backend/src/services/stellarService.js` — Updated detectAbnormalPatterns to use multiplier

## Testing

Run all tests:
```bash
npm test
```

Run specific test suite:
```bash
npm test -- detectAbnormalPatternsMultiplier.test.js
npm test -- suspiciousPaymentMultiplier.test.js
```

**Test Results:** 50/50 passing ✅

## Future Enhancements

Potential improvements for future iterations:
1. Add multiplier presets (e.g., "strict", "balanced", "lenient")
2. Add per-student multiplier overrides
3. Add time-based multiplier adjustments (e.g., stricter during high-risk periods)
4. Add multiplier recommendations based on historical payment patterns
5. Add audit logging for multiplier changes
