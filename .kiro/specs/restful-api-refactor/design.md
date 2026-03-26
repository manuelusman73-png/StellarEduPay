# Design Document: RESTful API Refactor

## Overview

The RESTful API Refactor standardizes the StellarEduPay backend API to follow consistent REST conventions. The current API has several inconsistencies including duplicate routes, inconsistent naming patterns, and improper HTTP method usage. This design provides a systematic approach to refactoring the API while maintaining backward compatibility and improving developer experience.

The refactoring focuses on three main areas: route consolidation, naming standardization, and proper REST resource modeling. The design ensures that the API becomes more predictable, easier to use, and follows industry best practices.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Express Backend                         │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                API Router Layer                      │  │
│  │  /api/v1/schools/:schoolId/students                  │  │
│  │  /api/v1/schools/:schoolId/payments                  │  │
│  │  /api/v1/schools/:schoolId/fees                      │  │
│  │  /api/v1/admin/retry-queue                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Route Consolidation                     │  │
│  │  - Remove duplicate routes                           │  │
│  │  - Standardize parameter names                       │  │
│  │  - Group related endpoints                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Backward Compatibility                    │  │
│  │  - Route aliases for existing endpoints              │  │
│  │  - Deprecation headers                               │  │
│  │  - Migration documentation                           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Components and Interfaces

### Route Structure Standardization

**Current Issues Identified:**
- Duplicate route definitions in `paymentRoutes.js`
- Inconsistent parameter naming (`studentId` vs `id`)
- Mixed resource access patterns
- Administrative routes mixed with user routes

**Proposed Structure:**

```
/api/v1/
├── schools/
│   ├── GET    /                     # List all schools
│   ├── POST   /                     # Create school (admin)
│   ├── GET    /:schoolId            # Get school details
│   ├── PATCH  /:schoolId            # Update school (admin)
│   ├── DELETE /:schoolId            # Deactivate school (admin)
│   │
│   ├── students/
│   │   ├── GET    /                 # List school students
│   │   ├── POST   /                 # Register student
│   │   ├── POST   /bulk             # Bulk import students
│   │   ├── GET    /:studentId       # Get student details
│   │   ├── PATCH  /:studentId       # Update student
│   │   └── GET    /:studentId/payments # Student payment history
│   │
│   ├── payments/
│   │   ├── GET    /                 # List school payments
│   │   ├── POST   /intents          # Create payment intent
│   │   ├── POST   /verify           # Verify payment
│   │   ├── POST   /sync             # Sync payments
│   │   ├── GET    /pending          # Pending payments
│   │   ├── GET    /suspicious       # Suspicious payments
│   │   ├── GET    /overpayments     # Overpayments
│   │   └── GET    /:paymentId       # Payment details
│   │
│   ├── fees/
│   │   ├── GET    /                 # List fee structures
│   │   ├── POST   /                 # Create fee structure
│   │   ├── GET    /:className       # Get class fee
│   │   └── DELETE /:className       # Delete fee structure
│   │
│   └── reports/
│       └── GET    /                 # Generate reports
│
├── admin/
│   ├── retry-queue/
│   │   ├── GET    /stats            # Queue statistics
│   │   ├── GET    /health           # Queue health
│   │   ├── GET    /jobs/:jobId      # Job details
│   │   ├── POST   /jobs/:jobId/retry # Retry job
│   │   └── DELETE /jobs/:jobId      # Delete job
│   │
│   └── system/
│       ├── GET    /health           # System health
│       └── POST   /consistency      # Run consistency check
│
└── public/
    ├── GET    /assets               # Accepted assets
    ├── GET    /limits               # Payment limits
    └── GET    /rates                # Exchange rates
```

### Route Consolidation Strategy

**Payment Routes Cleanup:**
The current `paymentRoutes.js` has significant duplication. The refactored version will:

1. **Remove duplicate route definitions**
2. **Consolidate similar endpoints**
3. **Standardize middleware application**
4. **Organize routes by HTTP method and specificity**

### Naming Convention Standards

**Resource Names:**
- Use plural nouns: `students`, `payments`, `schools`
- Use kebab-case for compound names: `retry-queue`, `fee-structures`
- Avoid abbreviations: `payments` not `pmts`

**Parameter Names:**
- Consistent ID naming: `schoolId`, `studentId`, `paymentId`
- Standard query parameters: `limit`, `offset`, `sort`, `filter`
- Date parameters in ISO format: `startDate`, `endDate`

**Action Names:**
- Use verbs for actions: `sync`, `verify`, `finalize`
- Group actions under resource: `/payments/sync` not `/sync-payments`

---

## Data Models

### Route Configuration

```js
{
  path: string,           // URL pattern
  method: string,         // HTTP method
  handler: function,      // Controller function
  middleware: array,      // Applied middleware
  deprecated: boolean,    // Deprecation status
  alias: string,         // Backward compatibility alias
  version: string        // API version
}
```

### API Response Format

```js
{
  data: any,             // Response payload
  meta: {
    version: string,     // API version
    timestamp: string,   // Response timestamp
    requestId: string    // Request tracking ID
  },
  pagination: {          // For collection responses
    limit: number,
    offset: number,
    total: number,
    hasMore: boolean
  },
  links: {              // HATEOAS links
    self: string,
    next: string,
    prev: string
  }
}
```

### Error Response Format

```js
{
  error: {
    code: string,        // Error code
    message: string,     // Human-readable message
    details: object,     // Additional error context
    field: string,       // Field causing validation error
    timestamp: string    // Error timestamp
  },
  meta: {
    version: string,
    requestId: string
  }
}
```

---

## Migration Strategy

### Phase 1: Route Consolidation
1. **Identify and remove duplicate routes**
2. **Standardize parameter names**
3. **Consolidate middleware application**
4. **Update route organization**

### Phase 2: Naming Standardization
1. **Rename inconsistent endpoints**
2. **Standardize query parameters**
3. **Update response formats**
4. **Add deprecation headers**

### Phase 3: Backward Compatibility
1. **Create route aliases for old endpoints**
2. **Add deprecation warnings**
3. **Update API documentation**
4. **Provide migration guides**

### Phase 4: Cleanup
1. **Remove deprecated aliases**
2. **Finalize API documentation**
3. **Update client libraries**
4. **Monitor usage metrics**

---

## Backward Compatibility Strategy

### Route Aliases
```js
// Old route -> New route mapping
const routeAliases = {
  '/api/payments/balance/:studentId': '/api/v1/schools/:schoolId/students/:studentId/balance',
  '/api/payments/instructions/:studentId': '/api/v1/schools/:schoolId/payments/instructions/:studentId',
  '/api/students/summary': '/api/v1/schools/:schoolId/students/summary'
};
```

### Deprecation Headers
```js
// Add to responses for deprecated endpoints
{
  'X-API-Deprecated': 'true',
  'X-API-Sunset': '2024-12-31',
  'X-API-Migration': 'https://docs.stellaredupay.com/api/migration'
}
```

### Version Management
- Current endpoints remain at `/api/*`
- New standardized endpoints at `/api/v1/*`
- Gradual migration with overlap period
- Clear sunset dates for old endpoints

---

## Performance Considerations

### Route Optimization
1. **Static routes before parameterized routes**
2. **Efficient middleware application**
3. **Route grouping for better matching**
4. **Caching for route resolution**

### Middleware Efficiency
1. **Apply school context only where needed**
2. **Optimize validation middleware**
3. **Reduce redundant middleware calls**
4. **Implement route-specific optimizations**

---

## Testing Strategy

### Unit Tests
- Route configuration validation
- Parameter parsing accuracy
- Middleware application order
- Error response formatting
- Backward compatibility aliases

### Integration Tests
- End-to-end API functionality
- Cross-resource relationship handling
- Authentication and authorization
- Performance regression testing
- Client compatibility verification

### Migration Testing
- Old endpoint functionality preservation
- New endpoint feature parity
- Deprecation header presence
- Route alias correctness
- Performance impact assessment