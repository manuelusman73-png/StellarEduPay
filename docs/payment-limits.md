# Payment Limits

## Overview

The Payment Limits feature provides configurable minimum and maximum thresholds for payment amounts as a security measure. This helps prevent:

- Accidental overpayments
- Fraudulent transactions
- System abuse
- Processing errors

## Configuration

Payment limits are configured via environment variables in the `.env` file:

```bash
# Minimum payment amount in XLM/USDC (default: 0.01)
MIN_PAYMENT_AMOUNT=0.01

# Maximum payment amount in XLM/USDC (default: 100000)
MAX_PAYMENT_AMOUNT=100000
```

### Default Values

- **Minimum**: 0.01 XLM/USDC
- **Maximum**: 100,000 XLM/USDC

### Validation Rules

The system validates that:
1. `MIN_PAYMENT_AMOUNT` must be a positive number (> 0)
2. `MAX_PAYMENT_AMOUNT` must be greater than `MIN_PAYMENT_AMOUNT`
3. If validation fails, the application will not start and will throw a configuration error

## How It Works

### 1. Payment Verification

When a payment transaction is verified via the `/api/payments/verify` endpoint:

1. The transaction is fetched from the Stellar network
2. The payment amount is extracted and normalized
3. **Payment limit validation is performed**
4. If the amount is outside the configured limits, the transaction is rejected with an appropriate error code

### 2. Payment Intent Creation

When creating a payment intent via the `/api/payments/intent` endpoint:

1. The student's fee amount is retrieved
2. **The fee amount is validated against payment limits**
3. If the fee amount is outside limits, the intent creation is rejected

### 3. Payment Synchronization

During automatic payment synchronization:

1. Recent transactions are fetched from the Stellar network
2. Each payment amount is validated against limits
3. Payments outside limits are skipped and not recorded

## API Endpoints

### Get Payment Limits

Retrieve the current payment limit configuration.

**Endpoint**: `GET /api/payments/limits`

**Response**:
```json
{
  "min": 0.01,
  "max": 100000,
  "message": "Payment amounts must be between 0.01 and 100000"
}
```

### Get Payment Instructions (Updated)

The payment instructions endpoint now includes payment limits information.

**Endpoint**: `GET /api/payments/instructions/:studentId`

**Response**:
```json
{
  "walletAddress": "GXXX...",
  "memo": "STUDENT123",
  "acceptedAssets": [...],
  "paymentLimits": {
    "min": 0.01,
    "max": 100000
  },
  "note": "Include the payment intent memo exactly when sending payment to ensure your fees are credited."
}
```

## Error Codes

When a payment is rejected due to limit violations, the following error codes are returned:

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `AMOUNT_TOO_LOW` | Payment amount is below the minimum allowed | 400 |
| `AMOUNT_TOO_HIGH` | Payment amount exceeds the maximum allowed | 400 |
| `INVALID_AMOUNT` | Payment amount is not a valid number or is zero/negative | 400 |

### Error Response Format

```json
{
  "error": "Payment amount 0.005 is below the minimum allowed amount of 0.01",
  "code": "AMOUNT_TOO_LOW"
}
```

## Implementation Details

### Validation Function

The core validation logic is implemented in [`backend/src/utils/paymentLimits.js`](../backend/src/utils/paymentLimits.js):

```javascript
function validatePaymentAmount(amount) {
  // Validates that amount is:
  // 1. A valid number
  // 2. Greater than zero
  // 3. Within configured min/max limits
  
  // Returns: { valid: boolean, error?: string, code?: string }
}
```

### Integration Points

Payment limit validation is integrated at three key points:

1. **[`stellarService.verifyTransaction()`](../backend/src/services/stellarService.js)** - Validates amounts during transaction verification
2. **[`paymentController.createPaymentIntent()`](../backend/src/controllers/paymentController.js)** - Validates fee amounts during intent creation
3. **[`stellarService.syncPayments()`](../backend/src/services/stellarService.js)** - Validates amounts during automatic synchronization

## Security Considerations

### Why Payment Limits Matter

1. **Fraud Prevention**: Limits help detect and prevent fraudulent transactions that may attempt to exploit the system
2. **Error Detection**: Catches accidental overpayments or data entry errors
3. **Resource Protection**: Prevents system abuse through extremely large or small transactions
4. **Compliance**: Helps meet regulatory requirements for transaction monitoring

### Best Practices

1. **Set Realistic Limits**: Configure limits based on your actual fee structure
2. **Monitor Rejections**: Track rejected payments to identify potential issues
3. **Regular Review**: Periodically review and adjust limits as needed
4. **Document Changes**: Keep a record of limit changes for audit purposes

## Testing

Comprehensive tests are available in [`tests/payment-limits.test.js`](../tests/payment-limits.test.js).

Run tests with:
```bash
npm test tests/payment-limits.test.js
```

### Test Coverage

- Valid amounts within limits
- Amounts below minimum
- Amounts above maximum
- Edge cases (zero, negative, NaN, non-numeric)
- Boundary values (exactly at min/max)

## Monitoring and Observability

### Rejected Payments

Payments rejected due to limit violations are recorded in the database with:
- Status: `failed`
- Student ID: `unknown` (if not identifiable)
- Amount: `0`

This provides an audit trail for security analysis.

### Metrics to Monitor

1. **Rejection Rate**: Track the percentage of payments rejected due to limits
2. **Rejection Reasons**: Monitor which limit (min/max) is triggered most often
3. **Temporal Patterns**: Identify if rejections cluster at certain times
4. **Student Impact**: Track if specific students are repeatedly affected

## Migration Guide

If you're adding payment limits to an existing deployment:

1. **Review Existing Data**: Analyze current payment amounts to set appropriate limits
2. **Set Conservative Limits**: Start with wider limits and tighten gradually
3. **Communicate Changes**: Notify users about the new limits
4. **Monitor Impact**: Watch for increased rejections after deployment
5. **Adjust as Needed**: Fine-tune limits based on real-world usage

## Troubleshooting

### Common Issues

**Issue**: Application won't start after adding payment limits
- **Cause**: Invalid configuration (e.g., max < min)
- **Solution**: Check `.env` file and ensure `MAX_PAYMENT_AMOUNT > MIN_PAYMENT_AMOUNT`

**Issue**: Valid payments are being rejected
- **Cause**: Limits set too restrictively
- **Solution**: Review and adjust `MIN_PAYMENT_AMOUNT` and `MAX_PAYMENT_AMOUNT`

**Issue**: Payment intent creation fails for existing students
- **Cause**: Student fee amounts exceed new limits
- **Solution**: Either adjust limits or update student fee amounts

## Future Enhancements

Potential improvements to the payment limits feature:

1. **Per-Asset Limits**: Different limits for XLM vs USDC
2. **Dynamic Limits**: Adjust limits based on student grade level or program
3. **Rate Limiting**: Limit number of payments per time period
4. **Admin Interface**: UI for managing limits without redeployment
5. **Alerts**: Notify admins when limits are frequently triggered
