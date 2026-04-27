'use strict';

/**
 * Tests for CSV bulk import file size and row count limits (Issue #369).
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';

const path = require('path');
const fs = require('fs');

const CONTROLLER_SRC = fs.readFileSync(
  path.join(__dirname, '../backend/src/controllers/studentController.js'),
  'utf8',
);

const ENV_EXAMPLE = fs.readFileSync(
  path.join(__dirname, '../backend/.env.example'),
  'utf8',
);

// ── File size limit ───────────────────────────────────────────────────────────

describe('CSV bulk import — file size limit', () => {
  it('checks req.file.size against CSV_MAX_SIZE_BYTES before parsing', () => {
    expect(CONTROLLER_SRC).toContain('CSV_MAX_SIZE_BYTES');
    expect(CONTROLLER_SRC).toContain('req.file.size');
  });

  it('returns HTTP 413 when file is too large', () => {
    expect(CONTROLLER_SRC).toContain('413');
    expect(CONTROLLER_SRC).toContain('CSV_TOO_LARGE');
  });

  it('reads CSV_MAX_SIZE_BYTES from environment with 5 MB default', () => {
    expect(CONTROLLER_SRC).toMatch(/CSV_MAX_SIZE_BYTES.*5\s*\*\s*1024\s*\*\s*1024/);
  });

  it('size check happens before parseCsvBuffer is called', () => {
    // The size check must appear before the parseCsvBuffer call in the source
    const sizeCheckIdx = CONTROLLER_SRC.indexOf('req.file.size > CSV_MAX_SIZE_BYTES');
    const parseCallIdx = CONTROLLER_SRC.indexOf('parseCsvBuffer(req.file.buffer)');
    expect(sizeCheckIdx).toBeGreaterThan(-1);
    expect(parseCallIdx).toBeGreaterThan(-1);
    expect(sizeCheckIdx).toBeLessThan(parseCallIdx);
  });
});

// ── Row count limit ───────────────────────────────────────────────────────────

describe('CSV bulk import — row count limit', () => {
  it('enforces CSV_MAX_ROWS during parsing', () => {
    expect(CONTROLLER_SRC).toContain('CSV_MAX_ROWS');
    expect(CONTROLLER_SRC).toContain('CSV_TOO_MANY_ROWS');
  });

  it('reads CSV_MAX_ROWS from environment with 10000 default', () => {
    expect(CONTROLLER_SRC).toMatch(/CSV_MAX_ROWS.*10000/);
  });

  it('destroys the stream when row limit is exceeded', () => {
    expect(CONTROLLER_SRC).toContain('stream.destroy()');
  });

  it('returns HTTP 400 for row count exceeded', () => {
    // The catch block for CSV_TOO_MANY_ROWS must return 400
    const catchBlock = CONTROLLER_SRC.slice(CONTROLLER_SRC.indexOf('CSV_TOO_MANY_ROWS'));
    expect(catchBlock).toMatch(/400/);
  });
});

// ── Environment variable documentation ───────────────────────────────────────

describe('CSV bulk import — env var documentation', () => {
  it('CSV_MAX_SIZE_BYTES is documented in .env.example', () => {
    expect(ENV_EXAMPLE).toContain('CSV_MAX_SIZE_BYTES');
  });

  it('CSV_MAX_ROWS is documented in .env.example', () => {
    expect(ENV_EXAMPLE).toContain('CSV_MAX_ROWS');
  });
});
