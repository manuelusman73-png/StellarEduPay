# Requirements Document

## Introduction

The audit log page (`frontend/src/pages/audit-logs.jsx`) currently fetches all payment audit log entries in a single API call. With thousands of entries this causes slow page loads and high browser memory usage. This feature adds server-side pagination to the audit log API endpoint and updates the frontend to load entries in batches of 50, with a "Load more" button, a total count display, loading state feedback, and URL-reflected page state for shareable links.

## Glossary

- **Audit_Log_Page**: The Next.js page at `frontend/src/pages/audit-logs.jsx` that displays payment audit log entries.
- **Audit_Log_API**: The Express endpoint `GET /api/audit-logs` that returns paginated payment records from MongoDB.
- **Page**: A discrete batch of 50 audit log entries returned by a single API call.
- **Cursor**: The page number (1-based integer) identifying which batch of entries to fetch.
- **Total_Count**: The total number of audit log entries matching the current query, returned alongside each page.
- **Load_More_Button**: The UI control that triggers fetching the next page of entries and appending them to the current list.
- **Loading_State**: A visual indicator shown while an API request is in flight.

---

## Requirements

### Requirement 1: Paginated Audit Log API Endpoint

**User Story:** As a school administrator, I want the audit log API to return entries in pages, so that the server does not send thousands of records in a single response.

#### Acceptance Criteria

1. THE Audit_Log_API SHALL accept a `page` query parameter (positive integer, default `1`) and a `limit` query parameter (positive integer, default `50`, maximum `100`).
2. WHEN a valid `page` and `limit` are provided, THE Audit_Log_API SHALL return exactly `limit` entries (or fewer on the last page), sorted by `confirmedAt` descending.
3. THE Audit_Log_API SHALL return a response envelope containing `{ data: [...], total: <integer>, page: <integer>, limit: <integer>, totalPages: <integer> }`.
4. WHEN `page` exceeds `totalPages`, THE Audit_Log_API SHALL return an empty `data` array with the correct `total` and `totalPages` values.
5. IF the `page` or `limit` query parameter is not a positive integer, THEN THE Audit_Log_API SHALL return HTTP 400 with an error message and code `VALIDATION_ERROR`.

### Requirement 2: Frontend Paginated Data Fetching

**User Story:** As a school administrator, I want the audit log page to load entries in batches, so that the page loads quickly even when thousands of entries exist.

#### Acceptance Criteria

1. WHEN the Audit_Log_Page loads, THE Audit_Log_Page SHALL fetch only the first page (50 entries) from the Audit_Log_API.
2. WHEN the user clicks the Load_More_Button, THE Audit_Log_Page SHALL fetch the next page and append the new entries to the existing list without replacing previously loaded entries.
3. WHILE a page fetch is in progress, THE Audit_Log_Page SHALL display a Loading_State indicator and disable the Load_More_Button.
4. WHEN all entries have been loaded (current count equals Total_Count), THE Audit_Log_Page SHALL hide the Load_More_Button.
5. IF an API request fails, THEN THE Audit_Log_Page SHALL display an error message and re-enable the Load_More_Button so the user can retry.

### Requirement 3: Total Count Display

**User Story:** As a school administrator, I want to see how many entries are loaded versus the total, so that I know how much data exists and how much I have viewed.

#### Acceptance Criteria

1. WHEN entries are displayed, THE Audit_Log_Page SHALL show a summary string in the format `"Showing X of Y entries"` where X is the number of currently loaded entries and Y is the Total_Count.
2. WHEN the Total_Count is zero, THE Audit_Log_Page SHALL display `"No entries found"` instead of the summary string.
3. WHEN additional entries are loaded via the Load_More_Button, THE Audit_Log_Page SHALL update the summary string to reflect the new loaded count.

### Requirement 4: URL-Reflected Page State

**User Story:** As a school administrator, I want the current page number to be reflected in the URL, so that I can share or bookmark a link that restores the same view.

#### Acceptance Criteria

1. WHEN the Audit_Log_Page loads with a `?page=N` query parameter, THE Audit_Log_Page SHALL pre-fetch all pages from 1 through N and display the combined entries.
2. WHEN the user loads more entries, THE Audit_Log_Page SHALL update the URL query parameter `page` to reflect the highest page loaded, without triggering a full page navigation.
3. WHEN the `?page` parameter is absent or invalid, THE Audit_Log_Page SHALL default to page 1 and display the first 50 entries.

### Requirement 5: Loading State

**User Story:** As a school administrator, I want visual feedback while entries are loading, so that I know the application is working and not frozen.

#### Acceptance Criteria

1. WHEN the initial page load fetch is in progress, THE Audit_Log_Page SHALL display a full-page loading indicator in place of the entry list.
2. WHEN a subsequent "load more" fetch is in progress, THE Audit_Log_Page SHALL display an inline loading indicator near the Load_More_Button.
3. WHEN a fetch completes (success or error), THE Audit_Log_Page SHALL remove the loading indicator.

### Requirement 6: API Service Integration

**User Story:** As a frontend developer, I want a typed API service function for the paginated audit log endpoint, so that all pages and components call the API consistently.

#### Acceptance Criteria

1. THE Audit_Log_API service function SHALL accept `{ page, limit }` parameters and return the full response envelope.
2. WHEN called without parameters, THE Audit_Log_API service function SHALL default to `page=1` and `limit=50`.
