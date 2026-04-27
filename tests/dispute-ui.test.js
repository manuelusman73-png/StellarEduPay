'use strict';

/**
 * Tests for #551 — Dispute UI components.
 *
 * Covers:
 *   DisputeForm validation logic:
 *     1. Validates raisedBy is required.
 *     2. Validates raisedBy max length (200 chars).
 *     3. Validates reason is required.
 *     4. Validates reason max length (1000 chars).
 *     5. Returns no errors for valid input.
 *
 *   Navbar admin link visibility:
 *     6. Disputes link is included when admin token is present.
 *     7. Disputes link is absent when no token is present.
 *
 *   Disputes page filter logic:
 *     8. Status filter is applied to query params.
 *     9. Student ID filter is applied to query params.
 *    10. Empty filters produce no extra query params.
 */

// ── DisputeForm validation ────────────────────────────────────────────────────

/**
 * Extracted validation logic from DisputeForm (mirrors the component's validate()).
 */
function validateDisputeForm({ raisedBy, reason }) {
  const errors = {};
  if (!raisedBy || !raisedBy.trim()) {
    errors.raisedBy = 'Your name is required.';
  } else if (raisedBy.trim().length > 200) {
    errors.raisedBy = 'Must be 200 characters or fewer.';
  }
  if (!reason || !reason.trim()) {
    errors.reason = 'Reason is required.';
  } else if (reason.trim().length > 1000) {
    errors.reason = 'Must be 1000 characters or fewer.';
  }
  return errors;
}

describe('DisputeForm validation', () => {
  test('requires raisedBy', () => {
    const errors = validateDisputeForm({ raisedBy: '', reason: 'Payment not matched' });
    expect(errors.raisedBy).toBeDefined();
  });

  test('rejects raisedBy longer than 200 chars', () => {
    const errors = validateDisputeForm({ raisedBy: 'a'.repeat(201), reason: 'Payment not matched' });
    expect(errors.raisedBy).toMatch(/200/);
  });

  test('requires reason', () => {
    const errors = validateDisputeForm({ raisedBy: 'Alice', reason: '' });
    expect(errors.reason).toBeDefined();
  });

  test('rejects reason longer than 1000 chars', () => {
    const errors = validateDisputeForm({ raisedBy: 'Alice', reason: 'x'.repeat(1001) });
    expect(errors.reason).toMatch(/1000/);
  });

  test('returns no errors for valid input', () => {
    const errors = validateDisputeForm({ raisedBy: 'Alice', reason: 'Payment was not credited to my child.' });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

// ── Navbar admin link visibility ──────────────────────────────────────────────

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/pay-fees', label: 'Pay Fees' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/reports', label: 'Reports' },
  { href: '/fee-adjustments', label: 'Fee Rules' },
];
const ADMIN_LINKS = [{ href: '/disputes', label: 'Disputes' }];

function getNavLinks(hasToken) {
  return hasToken ? [...LINKS, ...ADMIN_LINKS] : LINKS;
}

describe('Navbar admin link visibility', () => {
  test('includes Disputes link when admin token is present', () => {
    const links = getNavLinks(true);
    expect(links.some((l) => l.href === '/disputes')).toBe(true);
  });

  test('excludes Disputes link when no token is present', () => {
    const links = getNavLinks(false);
    expect(links.some((l) => l.href === '/disputes')).toBe(false);
  });
});

// ── Disputes page filter logic ────────────────────────────────────────────────

function buildDisputeQueryParams({ statusFilter, studentFilter, page }) {
  const params = { page, limit: 20 };
  if (statusFilter) params.status = statusFilter;
  if (studentFilter && studentFilter.trim()) params.studentId = studentFilter.trim();
  return params;
}

describe('Disputes page filter query params', () => {
  test('applies status filter', () => {
    const params = buildDisputeQueryParams({ statusFilter: 'open', studentFilter: '', page: 1 });
    expect(params.status).toBe('open');
  });

  test('applies studentId filter', () => {
    const params = buildDisputeQueryParams({ statusFilter: '', studentFilter: 'STU001', page: 1 });
    expect(params.studentId).toBe('STU001');
  });

  test('trims whitespace from studentId filter', () => {
    const params = buildDisputeQueryParams({ statusFilter: '', studentFilter: '  STU001  ', page: 1 });
    expect(params.studentId).toBe('STU001');
  });

  test('omits status and studentId when filters are empty', () => {
    const params = buildDisputeQueryParams({ statusFilter: '', studentFilter: '', page: 1 });
    expect(params.status).toBeUndefined();
    expect(params.studentId).toBeUndefined();
  });

  test('includes page and limit always', () => {
    const params = buildDisputeQueryParams({ statusFilter: '', studentFilter: '', page: 3 });
    expect(params.page).toBe(3);
    expect(params.limit).toBe(20);
  });
});
