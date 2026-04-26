'use strict';

const fs = require('fs');
const path = require('path');

const robotsPath = path.join(__dirname, '../frontend/public/robots.txt');
const sitemapPath = path.join(__dirname, '../frontend/public/sitemap.xml');

describe('robots.txt', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(robotsPath, 'utf8');
  });

  it('exists in frontend/public', () => {
    expect(fs.existsSync(robotsPath)).toBe(true);
  });

  it('disallows /dashboard', () => {
    expect(content).toMatch(/Disallow:\s*\/dashboard/);
  });

  it('disallows /audit-logs', () => {
    expect(content).toMatch(/Disallow:\s*\/audit-logs/);
  });

  it('disallows /reports', () => {
    expect(content).toMatch(/Disallow:\s*\/reports/);
  });

  it('disallows /test-currency', () => {
    expect(content).toMatch(/Disallow:\s*\/test-currency/);
  });

  it('allows / and /pay-fees', () => {
    expect(content).toMatch(/Allow:\s*\//);
    expect(content).toMatch(/Allow:\s*\/pay-fees/);
  });

  it('references the sitemap', () => {
    expect(content).toMatch(/Sitemap:/);
  });
});

describe('sitemap.xml', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(sitemapPath, 'utf8');
  });

  it('exists in frontend/public', () => {
    expect(fs.existsSync(sitemapPath)).toBe(true);
  });

  it('includes the home page', () => {
    expect(content).toContain('<loc>');
    expect(content).toMatch(/\/</); // URL ending before closing tag
  });

  it('includes /pay-fees', () => {
    expect(content).toContain('/pay-fees');
  });

  it('does not include sensitive routes', () => {
    expect(content).not.toContain('/dashboard');
    expect(content).not.toContain('/audit-logs');
    expect(content).not.toContain('/reports');
    expect(content).not.toContain('/test-currency');
  });
});
