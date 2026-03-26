# Route Mapping: Current → Standardized

## Overview

This document provides the exact mapping from current API routes to the new standardized RESTful structure.

## Route Transformations

### Payment Routes Consolidation

#### Current Issues in paymentRoutes.js
```javascript
// DUPLICATE DEFINITIONS FOUND:
router.get('/accepted-assets', getAcceptedAssets);     // Line 1
router.get('/accepted-assets', getAcceptedAssets);     // Line 2 (DUPLICATE)
router.get('/limits', getPaymentLimitsEndpoint);       // Line 1  
router.get('/limits', getPaymentLimitsEndpoint);       // Line 2 (DUPLICATE)
// ... more duplicates
```

#### Standardized Payment Routes
```javascript
// NEW STRUCTURE - No duplicates, proper organization
// Static routes first
router.get('/accepted-assets', getAcceptedAssets);
router.get('/limits', getPaymentLimitsEndpoint);
router.get('/overpayments', getOverpayments);
router.get('/suspicious', getSuspiciousPayments);
router.get('/pending', getPendingPayments);
router.get('/rates', getExchangeRates);

// Collection operations
router.get('/', getAllPayments);
router.post('/intents', createPaymentIntent);
router.post('/verify', verifyPayment);
router.post('/sync', syncAllPayments);
router.post('/finalize', finalizePayments);

// Parameterized routes last
router.get('/:paymentId', getPayment);
router.patch('/:paymentId', updatePayment);
router.delete('/:paymentId', deletePayment);

// Nested resource routes
router.get('/instructions/:studentId', getPaymentInstructions);
router.get('/balance/:studentId', getStudentBalance);
```

### Complete Route Mapping Table

| Current Route | HTTP Method | New Route | Notes |
|---------------|-------------|-----------|-------|
| **Payment Routes** |
| `/api/payments/` | GET | `/api/v1/schools/:schoolId/payments/` | School-scoped |
| `/api/payments/accepted-assets` | GET | `/api/v1/public/assets` | Move to public |
| `/api/payments/limits` | GET | `/api/v1/public/limits` | Move to public |
| `/api/payments/rates` | GET | `/api/v1/public/rates` | Move to public |
| `/api/payments/overpayments` | GET | `/api/v1/schools/:schoolId/payments/overpayments` | School-scoped |
| `/api/payments/suspicious` | GET | `/api/v1/schools/:schoolId/payments/suspicious` | School-scoped |
| `/api/payments/pending` | GET | `/api/v1/schools/:schoolId/payments/pending` | School-scoped |
| `/api/payments/retry-queue` | GET | `/api/v1/admin/retry-queue` | Move to admin |
| `/api/payments/balance/:studentId` | GET | `/api/v1/schools/:schoolId/students/:studentId/balance` | Nested resource |
| `/api/payments/instructions/:studentId` | GET | `/api/v1/schools/:schoolId/payments/instructions/:studentId` | School-scoped |
| `/api/payments/:studentId` | GET | `/api/v1/schools/:schoolId/students/:studentId/payments` | Nested resource |
| `/api/payments/intent` | POST | `/api/v1/schools/:schoolId/payments/intents` | School-scoped |
| `/api/payments/verify` | POST | `/api/v1/schools/:schoolId/payments/verify` | School-scoped |
| `/api/payments/sync` | POST | `/api/v1/schools/:schoolId/payments/sync` | School-scoped |
| `/api/payments/finalize` | POST | `/api/v1/schools/:schoolId/payments/finalize` | School-scoped |
| **Student Routes** |
| `/api/students/` | GET | `/api/v1/schools/:schoolId/students/` | School-scoped |
| `/api/students/` | POST | `/api/v1/schools/:schoolId/students/` | School-scoped |
| `/api/students/summary` | GET | `/api/v1/schools/:schoolId/students/summary` | School-scoped |
| `/api/students/bulk` | POST | `/api/v1/schools/:schoolId/students/bulk` | School-scoped |
| `/api/students/:studentId` | GET | `/api/v1/schools/:schoolId/students/:studentId` | School-scoped |
| **School Routes** |
| `/api/schools/` | GET | `/api/v1/schools/` | Keep as-is |
| `/api/schools/` | POST | `/api/v1/admin/schools/` | Admin operation |
| `/api/schools/:schoolSlug` | GET | `/api/v1/schools/:schoolId` | Standardize param |
| `/api/schools/:schoolSlug` | PATCH | `/api/v1/admin/schools/:schoolId` | Admin operation |
| `/api/schools/:schoolSlug` | DELETE | `/api/v1/admin/schools/:schoolId` | Admin operation |
| **Fee Routes** |
| `/api/fees/` | GET | `/api/v1/schools/:schoolId/fees/` | School-scoped |
| `/api/fees/` | POST | `/api/v1/schools/:schoolId/fees/` | School-scoped |
| `/api/fees/:className` | GET | `/api/v1/schools/:schoolId/fees/:feeId` | Standardize param |
| `/api/fees/:className` | DELETE | `/api/v1/schools/:schoolId/fees/:feeId` | Standardize param |
| **Report Routes** |
| `/api/reports/` | GET | `/api/v1/schools/:schoolId/reports/` | School-scoped |
| **Retry Queue Routes** |
| `/api/retry-queue/stats` | GET | `/api/v1/admin/retry-queue/stats` | Move to admin |
| `/api/retry-queue/health` | GET | `/api/v1/admin/retry-queue/health` | Move to admin |
| `/api/retry-queue/jobs/:jobId` | GET | `/api/v1/admin/retry-queue/jobs/:jobId` | Move to admin |
| `/api/retry-queue/jobs/state/:state` | GET | `/api/v1/admin/retry-queue/jobs/state/:state` | Move to admin |
| `/api/retry-queue/jobs/:jobId/retry` | POST | `/api/v1/admin/retry-queue/jobs/:jobId/retry` | Move to admin |
| `/api/retry-queue/jobs/:jobId` | DELETE | `/api/v1/admin/retry-queue/jobs/:jobId` | Move to admin |
| `/api/retry-queue/pause` | POST | `/api/v1/admin/retry-queue/pause` | Move to admin |
| `/api/retry-queue/resume` | POST | `/api/v1/admin/retry-queue/resume` | Move to admin |
| `/api/retry-queue/queue` | POST | `/api/v1/admin/retry-queue/queue` | Move to admin |
| **System Routes** |
| `/api/consistency` | GET | `/api/v1/admin/system/consistency` | Move to admin |
| `/health` | GET | `/api/v1/public/health` | Move to public |

## Parameter Standardization

### Current Parameter Names → Standardized
| Current | Standardized | Affected Routes |
|---------|--------------|-----------------|
| `:schoolSlug` | `:schoolId` | All school routes |
| `:className` | `:feeId` | Fee routes |
| `:studentId` | `:studentId` | ✓ Already correct |
| `:paymentId` | `:paymentId` | ✓ Already correct |
| `:jobId` | `:jobId` | ✓ Already correct |

## New Route Hierarchy

### API v1 Structure
```
/api/v1/
├── public/
│   ├── GET /assets              # Accepted assets
│   ├── GET /limits              # Payment limits  
│   ├── GET /rates               # Exchange rates
│   └── GET /health              # System health
│
├── schools/
│   ├── GET    /                 # List schools
│   ├── GET    /:schoolId        # Get school
│   │
│   ├── students/
│   │   ├── GET    /             # List students
│   │   ├── POST   /             # Create student
│   │   ├── POST   /bulk         # Bulk import
│   │   ├── GET    /summary      # Payment summary
│   │   ├── GET    /:studentId   # Get student
│   │   ├── PATCH  /:studentId   # Update student
│   │   ├── GET    /:studentId/payments  # Student payments
│   │   └── GET    /:studentId/balance   # Student balance
│   │
│   ├── payments/
│   │   ├── GET    /             # List payments
│   │   ├── POST   /intents      # Create intent
│   │   ├── POST   /verify       # Verify payment
│   │   ├── POST   /sync         # Sync payments
│   │   ├── POST   /finalize     # Finalize payments
│   │   ├── GET    /pending      # Pending payments
│   │   ├── GET    /suspicious   # Suspicious payments
│   │   ├── GET    /overpayments # Overpayments
│   │   ├── GET    /instructions/:studentId # Payment instructions
│   │   └── GET    /:paymentId   # Payment details
│   │
│   ├── fees/
│   │   ├── GET    /             # List fees
│   │   ├── POST   /             # Create fee
│   │   ├── GET    /:feeId       # Get fee
│   │   ├── PATCH  /:feeId       # Update fee
│   │   └── DELETE /:feeId       # Delete fee
│   │
│   └── reports/
│       └── GET    /             # Generate reports
│
└── admin/
    ├── schools/
    │   ├── POST   /             # Create school
    │   ├── PATCH  /:schoolId    # Update school
    │   └── DELETE /:schoolId    # Delete school
    │
    ├── retry-queue/
    │   ├── GET    /stats        # Queue stats
    │   ├── GET    /health       # Queue health
    │   ├── GET    /jobs/:jobId  # Job details
    │   ├── POST   /jobs/:jobId/retry # Retry job
    │   ├── DELETE /jobs/:jobId  # Delete job
    │   ├── POST   /pause        # Pause queue
    │   ├── POST   /resume       # Resume queue
    │   └── POST   /queue        # Queue transaction
    │
    └── system/
        └── POST   /consistency  # Run consistency check
```

## Backward Compatibility Aliases

### Route Aliases Configuration
```javascript
const routeAliases = {
  // Payment route aliases
  '/api/payments/': '/api/v1/schools/:schoolId/payments/',
  '/api/payments/accepted-assets': '/api/v1/public/assets',
  '/api/payments/limits': '/api/v1/public/limits',
  '/api/payments/rates': '/api/v1/public/rates',
  '/api/payments/balance/:studentId': '/api/v1/schools/:schoolId/students/:studentId/balance',
  '/api/payments/instructions/:studentId': '/api/v1/schools/:schoolId/payments/instructions/:studentId',
  '/api/payments/:studentId': '/api/v1/schools/:schoolId/students/:studentId/payments',
  
  // Student route aliases  
  '/api/students/': '/api/v1/schools/:schoolId/students/',
  '/api/students/:studentId': '/api/v1/schools/:schoolId/students/:studentId',
  
  // School route aliases
  '/api/schools/:schoolSlug': '/api/v1/schools/:schoolId',
  
  // Fee route aliases
  '/api/fees/': '/api/v1/schools/:schoolId/fees/',
  '/api/fees/:className': '/api/v1/schools/:schoolId/fees/:feeId',
  
  // Admin route aliases
  '/api/retry-queue/*': '/api/v1/admin/retry-queue/*',
  '/api/consistency': '/api/v1/admin/system/consistency',
  '/health': '/api/v1/public/health'
};
```

## Implementation Priority

### Phase 1: Critical Fixes
1. Remove duplicate routes in paymentRoutes.js
2. Fix middleware application issues
3. Standardize parameter names

### Phase 2: Route Restructuring  
1. Implement new route hierarchy
2. Add backward compatibility aliases
3. Update route mounting in app.js

### Phase 3: Enhancement
1. Add missing HTTP methods (PATCH, PUT)
2. Implement proper error responses
3. Add API documentation

### Phase 4: Cleanup
1. Remove deprecated aliases
2. Update client documentation
3. Monitor usage and performance