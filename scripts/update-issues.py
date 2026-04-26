#!/usr/bin/env python3
"""
Reads GITHUB_ISSUES.md, expands each issue body to be long and detailed
with plain-text acceptance criteria (no checkboxes), then updates GitHub.
"""
import subprocess, os, re, tempfile, time, json

REPO = "manuelusman73-png/StellarEduPay"
MD_FILE = "/workspaces/StellarEduPay/GITHUB_ISSUES.md"

def get_issue_list():
    out = subprocess.check_output(
        ["gh", "issue", "list", "--repo", REPO, "--limit", "200", "--json", "number,title"],
        encoding="utf8"
    )
    return json.loads(out)

def expand_body(title, original_body):
    """Expand the body: remove checkboxes, add Background/Impact/Root Cause sections."""
    # Remove checkbox markers
    body = re.sub(r'- \[ \] ', '- ', original_body)
    body = re.sub(r'- \[x\] ', '- ', body)

    # Extract existing sections
    desc_match = re.search(r'\*\*Description:\*\*\s*(.*?)(?=\*\*Steps|\*\*Expected|\*\*Acceptance|$)', body, re.DOTALL)
    steps_match = re.search(r'\*\*Steps to Reproduce:\*\*\s*(.*?)(?=\*\*Expected|\*\*Acceptance|$)', body, re.DOTALL)
    expected_match = re.search(r'\*\*Expected Behavior:\*\*\s*(.*?)(?=\*\*Acceptance|$)', body, re.DOTALL)
    criteria_match = re.search(r'\*\*Acceptance Criteria:\*\*\s*(.*?)(?=---|$)', body, re.DOTALL)

    description = desc_match.group(1).strip() if desc_match else original_body.strip()
    steps = steps_match.group(1).strip() if steps_match else ""
    expected = expected_match.group(1).strip() if expected_match else ""
    criteria_raw = criteria_match.group(1).strip() if criteria_match else ""

    # Convert criteria bullets to plain numbered sentences
    criteria_lines = [l.strip().lstrip('- ').strip() for l in criteria_raw.splitlines() if l.strip().startswith('-')]
    criteria_text = "\n\n".join(f"{i+1}. {line}" for i, line in enumerate(criteria_lines)) if criteria_lines else criteria_raw

    expanded = f"""## Overview

{description}

## Background and Context

This issue was identified during a review of the StellarEduPay codebase. StellarEduPay is a blockchain-based school fee payment system built on the Stellar network. It processes real financial transactions on behalf of schools and parents, which means correctness, security, and reliability are paramount. Issues in this system can directly affect whether students are correctly credited for payments, whether school administrators have accurate financial data, and whether the system is secure against abuse.

The specific problem described here represents a gap between the intended behavior of the system and its actual behavior. Left unaddressed, it could cause data integrity issues, security vulnerabilities, degraded performance, or a poor user experience depending on the nature of the issue.

## Detailed Problem Description

{description}

{f"## Steps to Reproduce{chr(10)}{chr(10)}{steps}" if steps else ""}

## Expected Behavior

{expected if expected else "The system should behave correctly and securely as described in the acceptance criteria below. The fix should be backward-compatible with existing data and deployments where possible."}

## Impact Assessment

This issue affects the reliability and correctness of the StellarEduPay platform. In a school fee payment context, bugs and missing features can have direct financial consequences — payments may be missed, incorrectly attributed, or processed multiple times. Security issues can expose sensitive student and payment data. Performance issues can degrade the experience for parents and administrators during peak payment periods such as the start of a school term.

## Proposed Solution

The fix should address the root cause of the issue rather than applying a superficial patch. Where possible, the solution should be implemented in a way that is testable, maintainable, and consistent with the existing codebase patterns. New environment variables should be documented in .env.example. New API endpoints should be documented in docs/api-spec.md. Database schema changes should be accompanied by a migration script.

## Acceptance Criteria

{criteria_text if criteria_text else "The issue must be resolved as described. Tests must be added or updated to cover the fix. Documentation must be updated where applicable."}

## Testing Requirements

All changes must be accompanied by appropriate tests. Unit tests should cover the core logic of the fix. Integration tests should verify the fix works correctly in the context of the full application. Edge cases and error conditions must be tested. Tests must pass in CI without requiring real network connections to Stellar or external services.

## Documentation Requirements

If the fix introduces new environment variables, they must be added to .env.example with descriptions. If the fix changes API behavior, docs/api-spec.md must be updated. If the fix changes the deployment process, README.md must be updated. Code comments should explain non-obvious implementation decisions.
"""
    return expanded.strip()

def update_issue(number, body):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False, encoding='utf8') as f:
        f.write(body)
        tmp = f.name
    try:
        result = subprocess.run(
            ["gh", "issue", "edit", str(number), "--repo", REPO, "--body-file", tmp],
            capture_output=True, encoding="utf8"
        )
        return result.returncode == 0, result.stderr
    finally:
        os.unlink(tmp)

def parse_issues(md_file):
    with open(md_file, encoding='utf8') as f:
        content = f.read()
    blocks = re.split(r'\n(?=## Issue #\d+:)', content)
    issues = []
    for block in blocks:
        m = re.match(r'^## Issue #\d+:\s*(.+)', block)
        if not m:
            continue
        title = m.group(1).strip()
        body = re.sub(r'^## Issue #\d+:.*\n', '', block).strip()
        body = re.sub(r'\*\*Labels:\*\*.*\n', '', body).strip()
        issues.append((title, body))
    return issues

def main():
    print("Fetching issue list from GitHub...")
    gh_issues = get_issue_list()
    # Build lookup: normalized title -> number
    lookup = {}
    for i in gh_issues:
        # strip backticks for matching
        key = re.sub(r'[`]', '', i['title']).strip().lower()
        lookup[key] = i['number']

    print(f"Found {len(gh_issues)} issues on GitHub")

    issues = parse_issues(MD_FILE)
    print(f"Found {len(issues)} issues in markdown file")

    updated = skipped = failed = 0
    for title, body in issues:
        # Find matching GitHub issue
        clean_title = re.sub(r'[`]', '', title).strip().lower()
        number = lookup.get(clean_title)
        if not number:
            # Try partial match
            for k, v in lookup.items():
                if clean_title[:40] in k or k[:40] in clean_title:
                    number = v
                    break
        if not number:
            print(f"  ⚠ No match: {title[:60]}")
            skipped += 1
            continue

        expanded = expand_body(title, body)
        ok, err = update_issue(number, expanded)
        if ok:
            print(f"  ✓ #{number}: {title[:65]}")
            updated += 1
        else:
            print(f"  ✗ #{number}: {err[:80]}")
            failed += 1

        time.sleep(0.3)

    print(f"\nDone. Updated: {updated}, Skipped: {skipped}, Failed: {failed}")

if __name__ == '__main__':
    main()
