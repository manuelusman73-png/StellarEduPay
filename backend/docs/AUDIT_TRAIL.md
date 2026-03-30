# Audit Trail System

## Overview

The audit trail system provides comprehensive logging of all administrative actions in the StellarEduPay system. Every write operation performed by administrators is logged with full context for accountability, fraud detection, and compliance.

## Features

- **Automatic Logging**: All admin write operations are automatically logged
- **Comprehensive Context**: Captures who, what, when, where, and why
- **Queryable History**: Filter and search audit logs by action type, date range, and more
- **Dashboard Integration**: Recent audit entries displayed in admin dashboard
- **Immutable Records**: Audit logs cannot be modified or deleted

## Architecture

### Components

1. **AuditLog Model** (`backend/src/models/auditLogModel.js`)
   - MongoDB schema for audit log entries
   - Indexed for efficient querying

2. **Audit Service** (`backend/src/services/auditService.js`)
   - `logAudit()`: Creates audit log entries
   - `getAuditLogs()`: Retrieves logs with filtering and pagination
   - `getRecentAuditLogs()`: Gets recent logs for dashboard

3. **Audit Context Middleware** (`backend/src/middleware/auditContext.js`)
   - Captures admin user info, IP address, and user agent
   - Attaches `req.auditContext` for controllers to use

4. **Audit Controller** (`backend/src/controllers/auditController.js`)
   - Handles API endpoints for retrieving audit logs

5. **Audit Routes** (`backend/src/routes/auditRoutes.js`)
   - `GET /api/audit-logs` - Query audit logs with filters
   - `GET /api/audit-logs/recent` - Get recent logs for dashboard

## Logged Actions

### Student Operations
- `student_create` - Student registration
- `student_update` - Student information updates
- `student_delete` - Student deletion
- `student_bulk_import` - Bulk student import

### Payment Operations
- `payment_manual_sync` - Manual blockchain sync
- `payment_finalize` - Payment finalization

### Fee Operations
- `fee_create` - Fee structure creation
- `fee_update` - Fee structure updates
- `fee_delete` - Fee structure deletion

### School Operations
- `school_create` - School creation
- `school_update` - School information updates
- `school_deactivate` - School deactivation

## Audit Log Schema

```javascript
{
  schoolId: String,        // School context
  action: String,          // Action type (e.g., 'student_create')
  performedBy: String,     // Admin user identifier (email or userId)
  targetId: String,        // ID of affected resource
  targetType: String,      // Type: 'student', 'payment', 'fee', 'school'
  details: Object,         // Additional context (before/after values, etc.)
  result: String,          // 'success' or 'failure'
  errorMessage: String,    // Error details if result is 'failure'
  ipAddress: String,       // Client IP address
  userAgent: String,       // Client user agent
  createdAt: Date,         // Timestamp (auto-generated)
  updatedAt: Date          // Last update (auto-generated)
}
```

## API Endpoints

### Get Audit Logs
```
GET /api/audit-logs
```

**Query Parameters:**
- `action` - Filter by action type
- `targetType` - Filter by target type (student, payment, fee, school)
- `performedBy` - Filter by admin user
- `startDate` - Filter by date range (ISO 8601)
- `endDate` - Filter by date range (ISO 8601)
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50, max: 200)

**Response:**
```json
{
  "logs": [...],
  "total": 150,
  "page": 1,
  "pages": 3
}
```

### Get Recent Audit Logs
```
GET /api/audit-logs/recent?limit=10
```

**Response:**
```json
[
  {
    "_id": "...",
    "schoolId": "SCH-ABC123",
    "action": "student_create",
    "performedBy": "admin@school.edu",
    "targetId": "STU-001",
    "targetType": "student",
    "details": { "name": "John Doe", "class": "Grade 10" },
    "result": "success",
    "ipAddress": "192.168.1.1",
    "createdAt": "2026-03-30T10:30:00Z"
  }
]
```

## Integration Guide

### Adding Audit Logging to a Controller

1. **Import the audit service:**
```javascript
const { logAudit } = require('../services/auditService');
```

2. **Add auditContext middleware to route:**
```javascript
router.post('/', requireAdminAuth, auditContext, myController);
```

3. **Log the action in controller:**
```javascript
async function myController(req, res, next) {
  try {
    // Perform the operation
    const result = await performOperation();

    // Log success
    if (req.auditContext) {
      await logAudit({
        schoolId: req.schoolId,
        action: 'my_action',
        performedBy: req.auditContext.performedBy,
        targetId: result.id,
        targetType: 'resource_type',
        details: { /* relevant data */ },
        result: 'success',
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }

    res.json(result);
  } catch (err) {
    // Log failure
    if (req.auditContext) {
      await logAudit({
        schoolId: req.schoolId,
        action: 'my_action',
        performedBy: req.auditContext.performedBy,
        targetId: 'unknown',
        targetType: 'resource_type',
        details: {},
        result: 'failure',
        errorMessage: err.message,
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }
    next(err);
  }
}
```

## Frontend Integration

### Dashboard Component
The `AuditLog` component displays recent audit entries:

```jsx
import AuditLog from "../components/AuditLog";

<AuditLog limit={10} />
```

### Full Audit Logs Page
Navigate to `/audit-logs` to view and filter all audit logs with:
- Action type filtering
- Target type filtering
- Date range filtering
- Pagination

## Security Considerations

1. **Authentication Required**: All audit endpoints require admin authentication
2. **School Scoping**: Audit logs are scoped to the school context
3. **Immutable Records**: Audit logs cannot be modified or deleted
4. **IP Tracking**: Client IP addresses are logged for security analysis
5. **Failure Logging**: Failed operations are logged with error details

## Performance

- **Indexed Queries**: Compound indexes on common query patterns
- **Pagination**: Results are paginated to prevent large data transfers
- **Async Logging**: Audit logging is non-blocking and won't slow down operations
- **Error Handling**: Audit logging failures don't block the main operation

## Compliance

The audit trail system helps meet compliance requirements for:
- **Financial Regulations**: Track all financial transactions and modifications
- **Data Protection**: Log access and modifications to student data
- **Accountability**: Identify who performed what action and when
- **Fraud Detection**: Detect suspicious patterns in admin actions

## Monitoring

Monitor audit logs for:
- Unusual patterns (e.g., bulk deletions)
- Failed operations
- After-hours access
- Multiple failed attempts
- Suspicious IP addresses

## Future Enhancements

- Export audit logs to CSV/PDF
- Real-time alerts for suspicious activities
- Audit log retention policies
- Advanced analytics and reporting
- Integration with SIEM systems
