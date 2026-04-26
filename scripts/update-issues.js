#!/usr/bin/env node
/**
 * Updates all StellarEduPay GitHub issues with long, detailed descriptions
 * and plain-text acceptance criteria (no checkboxes).
 */
const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = 'manuelusman73-png/StellarEduPay';

// Map of issue title substring → detailed body
const ISSUES = [
{
title: "JWT_SECRET not required at startup",
body: `## Background

Authentication in StellarEduPay relies on JSON Web Tokens (JWT) to protect admin-only endpoints such as school management, audit log access, and retry queue monitoring. The JWT signing secret is configured via the \`JWT_SECRET\` environment variable and is used by \`backend/src/middleware/auth.js\` to verify incoming tokens.

## Problem Description

In \`backend/src/config/index.js\`, the \`JWT_SECRET\` variable is assigned \`null\` when not present in the environment, and it is not included in the \`REQUIRED\` array that triggers startup validation. As a result, the Express server starts successfully even when no JWT secret is configured. The absence of a secret is only discovered at runtime when an admin-protected route is first accessed, at which point the middleware throws a 500 Internal Server Error instead of a clear configuration error.

This is a critical security gap because it means the application can be deployed to production without any working authentication. Non-admin routes remain fully accessible, and there is no startup warning to alert the operator that admin features are broken. A developer who forgets to set \`JWT_SECRET\` in their deployment environment will have no indication of the problem until an admin action fails in production.

## Impact

Any deployment that omits \`JWT_SECRET\` from its environment configuration will silently run without functional admin authentication. Admin endpoints will return 500 errors instead of 401, which is confusing for API consumers and masks the real cause. In a school environment where admin endpoints control fee structures, student records, and payment data, this represents a significant operational and security risk.

## Root Cause

The \`REQUIRED\` array in \`config/index.js\` only includes \`MONGO_URI\`, \`SCHOOL_WALLET_ADDRESS\`, and \`STELLAR_NETWORK\`. Adding \`JWT_SECRET\` to this array, or adding a conditional check that fails startup in production when it is absent, would resolve the issue.

## Acceptance Criteria

JWT_SECRET must be validated at application startup. If the variable is missing and NODE_ENV is set to production, the process must exit with a non-zero exit code and a clear error message identifying the missing variable. If NODE_ENV is not production, a prominent WARNING must be logged at startup indicating that admin authentication is non-functional. The .env.example file must be updated to document JWT_SECRET as required for admin features. All existing tests must continue to pass after the change. A new test must verify that the application refuses to start in production mode when JWT_SECRET is absent.`
},
{
title: "consistencyService.js` uses global `SCHOOL_WALLET",
body: `## Background

StellarEduPay supports a multi-school architecture where each school has its own Stellar wallet address stored in the \`School\` MongoDB document. The consistency service is responsible for comparing on-chain transactions against the local payment database to detect discrepancies — payments recorded on the blockchain but missing from the database, or database records with no corresponding on-chain transaction.

## Problem Description

\`backend/src/services/consistencyService.js\` imports \`SCHOOL_WALLET\` directly from \`stellarConfig.js\`, which reads from the \`SCHOOL_WALLET_ADDRESS\` environment variable. This hardcoded global wallet address is used as the destination filter when scanning Stellar transactions. In a multi-school deployment, each school has its own \`stellarAddress\` stored in the database, and the global environment variable only represents one of them — typically the first school set up.

The consequence is that the consistency check silently ignores all schools except the one whose wallet matches the environment variable. Payments sent to other school wallets are never checked for consistency, meaning discrepancies in those schools go undetected indefinitely. This defeats the entire purpose of the consistency service in a multi-school context.

## Impact

Schools whose wallet address does not match \`SCHOOL_WALLET_ADDRESS\` will never have their payment records validated against the blockchain. Orphaned payments, missing records, and double-processing bugs will go undetected for those schools. The consistency check will also produce false positives for the single monitored school if transactions from other schools happen to share the same memo format.

## Root Cause

The service was originally written for a single-school deployment and was never updated to support the multi-school model. The fix requires fetching all active \`School\` documents from the database and iterating over each school's \`stellarAddress\` independently.

## Acceptance Criteria

The \`checkConsistency\` function must accept a \`schoolId\` parameter or iterate over all active School documents fetched from the database. Each school's \`stellarAddress\` must be used as the Horizon query destination for that school's consistency check. Payment records must be filtered by \`schoolId\` before comparison to avoid cross-school contamination. The global \`SCHOOL_WALLET\` import must be removed from \`consistencyService.js\`. A unit test must cover the multi-school scenario, verifying that each school's wallet is checked independently. The consistency scheduler must be updated to pass the correct school context to the service.`
},
{
title: "No rate limiting on `/api/payments/verify`",
body: `## Background

The \`POST /api/payments/verify\` endpoint accepts a Stellar transaction hash and queries the Stellar Horizon API to retrieve and validate the transaction. This endpoint is publicly accessible and is intended for parents to confirm their payment was recorded correctly.

## Problem Description

While a global rate limiter exists in \`concurrentRequestHandler.js\` (100 requests per minute per IP), there is no endpoint-specific rate limit on the verify route. The global limit is shared across all endpoints, meaning an attacker can consume the entire rate limit budget on the verify endpoint alone, degrading service for all other users. More critically, the verify endpoint makes outbound HTTP requests to the Stellar Horizon API, which has its own rate limits. An attacker who sends hundreds of verify requests per minute could exhaust the application's Horizon API quota, causing all payment processing — including background sync — to fail with 429 errors from Horizon.

Additionally, the verify endpoint can be used for transaction hash enumeration. By systematically trying different hash values, an attacker could discover valid transaction hashes and learn information about payment activity, including amounts, student IDs embedded in memos, and timing.

## Impact

A single malicious actor can degrade payment processing for all schools by exhausting the Horizon API rate limit. The endpoint can be used for reconnaissance to enumerate valid transaction hashes. In a school environment, this could expose student payment data to unauthorized parties.

## Root Cause

The endpoint was designed for convenience without considering abuse scenarios. Adding a dedicated rate limiter with a stricter limit (e.g., 10 requests per minute per IP) would significantly reduce the attack surface.

## Acceptance Criteria

A dedicated rate limiter must be applied specifically to the POST /api/payments/verify route, separate from the global rate limiter. The limit must be configurable via a VERIFY_RATE_LIMIT environment variable with a default of 10 requests per minute per IP address. When the limit is exceeded, the endpoint must return HTTP 429 Too Many Requests with a Retry-After header indicating when the client may retry. The rate limiter must not affect other endpoints. A test must verify that the 11th request within a minute window returns 429. The .env.example file must document the VERIFY_RATE_LIMIT variable.`
},
{
title: "reportService.js` aggregates with `status: 'confirmed'",
body: `## Background

The reporting system in StellarEduPay aggregates payment data to produce summaries for school administrators. Reports include total amounts collected, payment counts broken down by validation status, and daily breakdowns. These reports are critical for financial reconciliation and auditing.

## Problem Description

In \`backend/src/services/reportService.js\`, the MongoDB aggregation pipeline uses \`{ status: 'confirmed' }\` as a match filter to select payments for inclusion in reports. However, the \`Payment\` model schema in \`backend/src/models/paymentModel.js\` defines the \`status\` field as an enum with values \`['PENDING', 'SUBMITTED', 'SUCCESS', 'FAILED']\`. There is no \`'confirmed'\` value in this enum.

The correct field for confirmed payments is either \`status: 'SUCCESS'\` or \`confirmationStatus: 'confirmed'\` (if that field exists). Because the filter matches no documents, every report generated by the system returns zero totals — zero payments, zero amounts collected, zero students paid. This means the reporting feature is completely broken and has been silently returning empty data since it was implemented.

## Impact

School administrators relying on reports for financial reconciliation are seeing empty reports and may believe no payments have been received, even when hundreds of successful payments exist in the database. This is a critical data integrity issue that undermines trust in the system.

## Root Cause

A mismatch between the status value used in the aggregation pipeline and the actual enum values defined in the Payment model. This likely occurred when the model was refactored to use uppercase status values but the report service was not updated.

## Acceptance Criteria

The aggregation pipeline in reportService.js must use the correct status field and value to match confirmed payments. The correct filter is status: 'SUCCESS' or the equivalent field that represents a successfully confirmed payment. An integration test must verify that report totals match the number and amount of SUCCESS payments in the database. Both the status and confirmationStatus fields must be documented in the Payment model JSDoc comments to prevent future confusion. The fix must be verified against a database containing known payment records to confirm totals are accurate.`
},
{
title: "Memo encryption produces output exceeding Stellar",
body: `## Background

StellarEduPay uses the Stellar transaction memo field to embed student IDs, enabling automatic payment matching when transactions are synced from the blockchain. Stellar's MEMO_TEXT type supports a maximum of 28 bytes. An optional memo encryption feature exists in \`backend/src/utils/memoEncryption.js\` to protect student IDs from being visible in the public blockchain.

## Problem Description

The encryption implementation uses AES-256-GCM, which produces output consisting of a 12-byte initialization vector, variable-length ciphertext, and a 16-byte authentication tag. This output is then base64url-encoded for transmission. Even for a minimal 4-character student ID like "S001", the encrypted output is approximately 44 base64url characters — far exceeding Stellar's 28-character MEMO_TEXT limit.

The code comments in \`memoEncryption.js\` acknowledge this limitation but provide no enforcement or fallback. When encryption is enabled, the system will attempt to set a memo that exceeds the limit, which will either be silently truncated by the Stellar SDK (making decryption impossible) or rejected by the Stellar network with a transaction error. In either case, the payment cannot be matched to a student.

## Impact

Any school that enables memo encryption will find that all payments fail to be matched to students, because the encrypted memo either cannot be set on the transaction or cannot be decrypted after truncation. This is a silent failure — the payment is recorded on the blockchain but never credited to the student.

## Root Cause

The encryption scheme was designed without accounting for Stellar's memo length constraints. The solution is to use Stellar's MEMO_HASH type (which supports 32 bytes of arbitrary binary data) when encryption is enabled, storing a hash or truncated encrypted value that fits within the constraint.

## Acceptance Criteria

When MEMO_ENCRYPTION_KEY is configured, the system must use Stellar's MEMO_HASH type instead of MEMO_TEXT for encrypted payloads. The payment instructions endpoint must document the memo type change when encryption is active, so that wallet applications know to use MEMO_HASH. The decryption logic on the receiving side must handle MEMO_HASH type correctly. A unit test must verify that the encrypted memo fits within Stellar's constraints for various student ID lengths. The .env.example file must document the memo type implication of enabling encryption. The README must warn that enabling encryption requires wallet support for MEMO_HASH.`
},
];

// Get all issue numbers
const issueList = JSON.parse(
  execSync(`gh issue list --repo "${REPO}" --limit 200 --json number,title`, { encoding: 'utf8' })
);

let updated = 0, skipped = 0;

for (const issue of ISSUES) {
  const match = issueList.find(i => i.title.includes(issue.title.replace(/`/g, '')));
  if (!match) {
    console.log(`⚠ Not found: ${issue.title.substring(0, 60)}`);
    skipped++;
    continue;
  }

  const tmpFile = path.join(os.tmpdir(), `issue-update-${match.number}.md`);
  fs.writeFileSync(tmpFile, issue.body);

  const result = spawnSync('gh', ['issue', 'edit', String(match.number), '--repo', REPO, '--body-file', tmpFile], { encoding: 'utf8' });
  fs.unlinkSync(tmpFile);

  if (result.status === 0) {
    console.log(`✓ #${match.number}: ${match.title.substring(0, 60)}`);
    updated++;
  } else {
    console.error(`✗ #${match.number}: ${result.stderr?.substring(0, 100)}`);
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
}

console.log(`\nUpdated: ${updated}, Skipped: ${skipped}`);
