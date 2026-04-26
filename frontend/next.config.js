/** @type {import('next').NextConfig} */

// Content-Security-Policy for the Next.js frontend.
//
// Why here and not in the Express backend?
// The backend serves only JSON API responses — CSP directives like scriptSrc
// and styleSrc are meaningless for JSON. The frontend (Next.js) renders HTML
// and is the correct place to enforce a browser-facing CSP.
//
// No 'unsafe-inline' or 'unsafe-eval' are used. Next.js SSR injects a small
// inline script for hydration; we allow it via a strict-dynamic approach by
// listing the self origin and the Stellar Horizon API as the only external
// connect target.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  // Allow fetch/XHR to the backend API and Stellar Horizon (testnet + mainnet)
  "connect-src 'self' https://horizon-testnet.stellar.org https://horizon.stellar.org",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig = {
  // Produces a self-contained build in .next/standalone — required for Docker
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
