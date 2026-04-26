#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const content = fs.readFileSync('/workspaces/StellarEduPay/GITHUB_ISSUES.md', 'utf8');
const repo = 'manuelusman73-png/StellarEduPay';

const blocks = content.split(/\n(?=## Issue #\d+:)/g).filter(b => b.trim().startsWith('## Issue #'));
console.log(`Found ${blocks.length} issues`);

// Get already-created issue titles to skip duplicates
let existing = new Set();
try {
  const out = execSync(`gh issue list --repo "${repo}" --limit 200 --json title -q '.[].title'`, { encoding: 'utf8' });
  out.split('\n').filter(Boolean).forEach(t => existing.add(t.trim()));
  console.log(`Already exists: ${existing.size} issues`);
} catch(e) {}

let created = 0, skipped = 0, failed = 0;

for (let i = 0; i < blocks.length; i++) {
  const block = blocks[i];

  const titleMatch = block.match(/^## Issue #\d+:\s*(.+)/);
  if (!titleMatch) continue;
  const title = titleMatch[1].trim();

  if (existing.has(title)) {
    console.log(`⏭  [${i+1}/${blocks.length}] (exists) ${title.substring(0,60)}`);
    skipped++;
    continue;
  }

  const labelsMatch = [...block.matchAll(/`([^`]+)`/g)].slice(0, 6);
  const labelsLine = block.match(/\*\*Labels:\*\*(.+)/)?.[1] || '';
  const labels = [...labelsLine.matchAll(/`([^`]+)`/g)].map(m => m[1]);

  const body = block
    .replace(/^## Issue #\d+:.*\n/, '')
    .replace(/\*\*Labels:\*\*.*\n/, '')
    .trim();

  // Write body to temp file to avoid shell escaping issues
  const tmpBody = path.join(os.tmpdir(), `issue-body-${i}.md`);
  const tmpTitle = path.join(os.tmpdir(), `issue-title-${i}.txt`);
  fs.writeFileSync(tmpBody, body);
  fs.writeFileSync(tmpTitle, title);

  const args = ['issue', 'create', '--repo', repo, '--title', title, '--body-file', tmpBody];
  if (labels.length) args.push('--label', labels.join(','));

  const result = spawnSync('gh', args, { encoding: 'utf8' });

  fs.unlinkSync(tmpBody);
  fs.unlinkSync(tmpTitle);

  if (result.status === 0) {
    console.log(`✓ [${i+1}/${blocks.length}] ${title.substring(0,70)}`);
    created++;
  } else {
    // Retry without labels
    const args2 = ['issue', 'create', '--repo', repo, '--title', title, '--body-file', tmpBody.replace('.md', '-retry.md')];
    fs.writeFileSync(tmpBody.replace('.md', '-retry.md'), body);
    const r2 = spawnSync('gh', args2, { encoding: 'utf8' });
    fs.unlinkSync(tmpBody.replace('.md', '-retry.md'));
    if (r2.status === 0) {
      console.log(`✓ [${i+1}/${blocks.length}] ${title.substring(0,70)} (no labels)`);
      created++;
    } else {
      console.error(`✗ [${i+1}/${blocks.length}] ${title.substring(0,60)}: ${(result.stderr||'').substring(0,100)}`);
      failed++;
    }
  }

  // 300ms delay to avoid secondary rate limits
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
}

console.log(`\nDone. Created: ${created}, Skipped: ${skipped}, Failed: ${failed}`);
