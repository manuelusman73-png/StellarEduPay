# Implementation Plan: Audit Log Pagination

## Overview

Add a paginated `GET /api/audit-logs` backend endpoint, wire it into the Express app, create the `getAuditLogs` API service function, and build the `audit-logs.jsx` page with load-more, count summary, loading states, and URL-reflected page state.

## Tasks

- [ ] 1. Add paginated audit log controller and route
  - Create `backend/src/controllers/auditLogController.js` with `getAuditLogs(req, res, next)`
  - Parse and validate `page` (default 1) and `limit` (default 50, max 100) from `req.query`; call `next(err)` with `err.code = 'VALIDATION_ERROR'` for invalid values
  - Run `Payment.countDocuments()` and `Payment.find().sort({ confirmedAt: -1 }).skip((page-1)*limit).limit(limit)` in parallel
  - Return `{ data, total, page, limit, totalPages }` envelope
  - Create `backend/src/routes/auditLogRoutes.js` with `router.get('/', getAuditLogs)`
  - Mount the router at `/api/audit-logs` in `backend/src/app.js`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 1.1 Write property test for pagination envelope invariant
    - **Property 1: Pagination envelope invariant**
    - **Validates: Requirements 1.2, 1.3**
    - Use `fast-check` to generate random `(page, limit, datasetSize)` triples; mock `Payment` model; assert `data.length <= limit`, all five envelope fields present, `totalPages === Math.ceil(total / limit)`
    - Include edge case: `page > totalPages` returns empty `data` with correct `total`
    - `// Feature: audit-log-pagination, Property 1: pagination envelope invariant`

  - [ ]* 1.2 Write property test for invalid parameter rejection
    - **Property 2: Invalid parameters always rejected**
    - **Validates: Requirements 1.5**
    - Use `fast-check` to generate invalid `page`/`limit` values (zero, negative, non-numeric, float); assert HTTP 400 and `code: "VALIDATION_ERROR"` for each
    - `// Feature: audit-log-pagination, Property 2: invalid parameters always rejected`

- [ ] 2. Add `getAuditLogs` to the frontend API service
  - Add `export const getAuditLogs = ({ page = 1, limit = 50 } = {}) => api.get('/audit-logs', { params: { page, limit } });` to `frontend/src/services/api.js`
  - _Requirements: 6.1, 6.2_

  - [ ]* 2.1 Write unit test for API service defaults
    - Verify `getAuditLogs()` calls `/audit-logs?page=1&limit=50`
    - Verify `getAuditLogs({ page: 3, limit: 25 })` calls `/audit-logs?page=3&limit=25`
    - _Requirements: 6.1, 6.2_

- [ ] 3. Checkpoint — ensure backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Build the `audit-logs.jsx` page
  - Create `frontend/src/pages/audit-logs.jsx`
  - Manage state: `entries`, `page`, `total`, `totalPages`, `loading`, `initialLoading`, `error`
  - On mount: read `?page=N` from Next.js router (default 1); sequentially fetch pages 1..N via `getAuditLogs` and accumulate entries into state
  - Render a full-page loading indicator while `initialLoading` is true
  - Render the entry list as a table with columns: Date, Student ID, Tx Hash, Amount, Status, Fee Validation
  - Render the summary string: `"Showing X of Y entries"` or `"No entries found"` when total is 0
  - Render the Load More button when `entries.length < total`; disable it while `loading` is true; show an inline loading indicator beside it during subsequent fetches
  - On Load More click: fetch `page + 1`, append entries, update URL with `router.push({ query: { page: page + 1 } }, undefined, { shallow: true })`
  - On fetch error: set `error` message, re-enable Load More button
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_

  - [ ]* 4.1 Write property test for load-more append behaviour
    - **Property 3: Load more appends, never replaces**
    - **Validates: Requirements 2.2**
    - Use `fast-check` to generate random initial `entries` arrays and a next-page response; simulate the append reducer; assert all original entries remain at original indices and total length increases by the new page size
    - `// Feature: audit-log-pagination, Property 3: load more appends never replaces`

  - [ ]* 4.2 Write property test for Load More button visibility
    - **Property 4: Load More button hidden when fully loaded**
    - **Validates: Requirements 2.4**
    - Use `fast-check` to generate states where `entries.length >= total > 0`; render component with mocked API; assert Load More button is not in the document
    - `// Feature: audit-log-pagination, Property 4: load more button hidden when fully loaded`

  - [ ]* 4.3 Write property test for summary string format
    - **Property 5: Summary string format**
    - **Validates: Requirements 3.1, 3.2**
    - Use `fast-check` to generate random `(loaded, total)` pairs; assert rendered summary matches `"Showing X of Y entries"` for `total > 0` and `"No entries found"` for `total === 0`
    - `// Feature: audit-log-pagination, Property 5: summary string format`

  - [ ]* 4.4 Write example tests for loading state and error handling
    - Test: initial load shows full-page loading indicator; resolves to entry list
    - Test: Load More click disables button and shows inline indicator; resolves to appended list
    - Test: fetch failure shows error message and re-enables Load More button
    - Test: `?page=3` in URL causes pages 1, 2, 3 to be fetched and combined
    - Test: missing/invalid `?page` param defaults to page 1
    - _Requirements: 2.3, 2.5, 4.1, 4.3, 5.3_

- [ ] 5. Update documentation and environment files
  - Add the new endpoint to `docs/api-spec.md` under a new `## Audit Logs` section documenting `GET /api/audit-logs`, query params, and response envelope
  - Confirm no new environment variables are required (the endpoint uses the existing `NEXT_PUBLIC_API_URL`); add a comment to `frontend/.env.example` noting the audit log endpoint is served from the same base URL
  - _Requirements: 1.1, 1.3_

- [ ] 6. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- All tests mock MongoDB and do not require real Stellar or external network connections
- The `confirmedAt` field already has a MongoDB index, so skip + limit queries are efficient
- `fast-check` must be added as a dev dependency if not already present: `npm install --save-dev fast-check`
