# Implementation Plan: RESTful API Refactor

## Overview

This implementation plan refactors the StellarEduPay API to follow consistent RESTful conventions. The plan addresses current issues including duplicate routes, inconsistent naming, and improper HTTP method usage while maintaining backward compatibility through a phased migration approach.

## Tasks

- [x] 1. Analyze and document current API inconsistencies
  - Audit all existing route files for duplicates and inconsistencies
  - Document current endpoint patterns and naming conventions
  - Identify breaking changes and compatibility requirements
  - Create mapping of old routes to new standardized routes
  - _Requirements: 5.1, 5.2, 7.1_

- [x] 2. Clean up duplicate routes in paymentRoutes.js
  - [x] 2.1 Remove duplicate route definitions
    - Eliminate repeated route declarations in paymentRoutes.js
    - Consolidate middleware application for similar routes
    - Ensure single source of truth for each endpoint
    - _Requirements: 5.1, 5.2_

  - [x] 2.2 Standardize route organization
    - Group routes by HTTP method (GET, POST, etc.)
    - Place static routes before parameterized routes
    - Organize routes by specificity to avoid conflicts
    - _Requirements: 10.2, 10.3_

  - [x] 2.3 Fix parameter naming inconsistencies
    - Standardize parameter names across all routes (studentId, paymentId)
    - Update route patterns to use consistent naming
    - Update controller functions to match new parameter names
    - _Requirements: 1.3, 4.1_

- [ ] 3. Implement standardized route naming conventions
  - [ ] 3.1 Rename routes to follow REST conventions
    - Convert all resource names to plural nouns
    - Apply kebab-case for multi-word resources
    - Ensure descriptive action names for non-CRUD operations
    - _Requirements: 1.1, 1.2, 1.5_

  - [ ] 3.2 Standardize HTTP method usage
    - Ensure GET is used only for data retrieval
    - Use POST for creation and non-idempotent operations
    - Implement PATCH for partial updates where appropriate
    - Return correct HTTP status codes for each operation
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ] 3.3 Update query parameter conventions
    - Implement consistent pagination parameters (limit, offset)
    - Standardize filtering and sorting parameter names
    - Use ISO 8601 format for all date parameters
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 4. Reorganize routes into logical resource groups
  - [ ] 4.1 Restructure school-scoped routes
    - Move student routes under school context: `/api/schools/:schoolId/students`
    - Move payment routes under school context: `/api/schools/:schoolId/payments`
    - Move fee routes under school context: `/api/schools/:schoolId/fees`
    - _Requirements: 3.1, 3.2, 3.3, 9.1_

  - [ ] 4.2 Create admin route namespace
    - Move retry queue routes to `/api/admin/retry-queue`
    - Move system operations to `/api/admin/system`
    - Apply admin authentication to all admin routes
    - _Requirements: 3.6, 9.2_

  - [ ] 4.3 Create public route namespace
    - Move public endpoints to `/api/public` (assets, limits, rates)
    - Remove authentication requirements for public routes
    - Ensure proper caching headers for public data
    - _Requirements: 3.6, 9.4_

- [ ] 5. Implement backward compatibility layer
  - [ ] 5.1 Create route alias system
    - Implement middleware to handle old route patterns
    - Map old routes to new standardized routes
    - Preserve existing functionality during transition
    - _Requirements: 7.1, 7.2_

  - [ ] 5.2 Add deprecation headers
    - Add X-API-Deprecated headers to old endpoints
    - Include sunset dates for deprecated routes
    - Provide migration documentation links
    - _Requirements: 7.4_

  - [ ] 5.3 Implement API versioning
    - Add version prefix to new routes (/api/v1/)
    - Maintain old routes without version prefix
    - Create version-specific route handlers
    - _Requirements: 7.3_

- [ ] 6. Standardize error response formats
  - [ ] 6.1 Create consistent error response structure
    - Implement standardized error response format
    - Include appropriate HTTP status codes
    - Add descriptive error messages and codes
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ] 6.2 Update validation error handling
    - Standardize input validation across all endpoints
    - Return structured validation errors
    - Ensure consistent error format for all validation failures
    - _Requirements: 8.5, 6.4_

- [ ] 7. Update route files with new structure
  - [ ] 7.1 Refactor paymentRoutes.js
    - Remove all duplicate routes
    - Implement new route structure
    - Update middleware application
    - Add backward compatibility aliases
    - _Requirements: All payment-related requirements_

  - [ ] 7.2 Refactor studentRoutes.js
    - Update to new nested route structure under schools
    - Standardize parameter naming
    - Implement proper HTTP methods
    - _Requirements: Student-related requirements_

  - [ ] 7.3 Refactor schoolRoutes.js
    - Update to support nested resource routes
    - Implement proper admin authentication
    - Add public/private route separation
    - _Requirements: School-related requirements_

  - [ ] 7.4 Update remaining route files
    - Refactor feeRoutes.js, reportRoutes.js, retryQueueRoutes.js
    - Apply consistent patterns across all route files
    - Ensure proper middleware application
    - _Requirements: All remaining requirements_

- [ ] 8. Update app.js with new route structure
  - [ ] 8.1 Implement new route mounting strategy
    - Mount routes with proper versioning
    - Implement backward compatibility routing
    - Add deprecation middleware
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 8.2 Add API documentation middleware
    - Implement automatic API documentation generation
    - Add route discovery endpoints
    - Include deprecation information in documentation
    - _Requirements: 6.5, 7.4_

- [ ] 9. Checkpoint - Test API functionality
  - Ensure all existing functionality works with new routes
  - Verify backward compatibility aliases function correctly
  - Test error response formats across all endpoints
  - Ask the user if questions arise.

- [ ] 10. Update API documentation and client guides
  - [ ] 10.1 Create migration documentation
    - Document all route changes and new patterns
    - Provide examples of old vs new endpoint usage
    - Include timeline for deprecation and sunset
    - _Requirements: 7.4, 7.5_

  - [ ] 10.2 Update API reference documentation
    - Document new route structure and conventions
    - Include query parameter specifications
    - Add error response format documentation
    - _Requirements: 6.5, 8.1, 8.2_

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Focus on maintaining existing functionality while improving structure
- Implement changes incrementally to minimize disruption
- Prioritize backward compatibility during transition period
- Each route file should be refactored as a complete unit
- Test thoroughly after each major change
- Document all breaking changes and provide migration paths