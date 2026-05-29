# Security

## Content Security Policy (CSP)

StellarEduPay enforces a Content Security Policy on all HTTP responses to mitigate XSS attacks. The policy is applied at two layers: the Next.js frontend and the Express backend.

### Threat model

Without CSP, a successful XSS injection (e.g. a malicious student name rendered in the dashboard) can execute arbitrary JavaScript in the admin's browser, steal the JWT from `localStorage`, and exfiltrate school data. CSP prevents this by restricting which scripts, styles, and network destinations the browser will allow.

---

### Frontend CSP (`frontend/next.config.js`)

Applied to every HTML response via the Next.js `headers()` API:

```
Content-Security-Policy:
  default-src 'self';
  script-src  'self';
  style-src   'self';
  img-src     'self' data:;
  font-src    'self';
  connect-src 'self' https://horizon-testnet.stellar.org https://horizon.stellar.org;
  object-src  'none';
  frame-ancestors 'none';
  base-uri    'self';
  form-action 'self'
```

| Directive | Value | Rationale |
|-----------|-------|-----------|
| `default-src` | `'self'` | Deny all unlisted resource types by default |
| `script-src` | `'self'` | No inline scripts, no `eval`, no third-party JS |
| `style-src` | `'self'` | No inline styles, no third-party CSS |
| `img-src` | `'self' data:` | Allows inline SVG/base64 images used by the UI |
| `font-src` | `'self'` | Self-hosted fonts only |
| `connect-src` | `'self' https://horizon-testnet.stellar.org https://horizon.stellar.org` | Allows `fetch`/XHR to the backend API and both Stellar Horizon endpoints |
| `object-src` | `'none'` | Blocks Flash and other plugins |
| `frame-ancestors` | `'none'` | Prevents clickjacking (equivalent to `X-Frame-Options: DENY`) |
| `base-uri` | `'self'` | Prevents base-tag hijacking |
| `form-action` | `'self'` | Restricts form submissions to the same origin |

Additional security headers set alongside CSP:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

---

### Backend CSP (`backend/src/app.js`)

The Express backend serves only JSON API responses — directives for scripts, styles, and images are irrelevant. Helmet is configured with a minimal policy appropriate for an API:

```js
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
})
```

`default-src 'none'` means the browser should load nothing from this origin as a document resource. `frame-ancestors 'none'` prevents the API responses from being embedded in frames.

---

### Verification

The CSP configuration is covered by `tests/csp.test.js`, which verifies:

- The frontend `next.config.js` exports a `headers()` function returning a catch-all entry with a `Content-Security-Policy` header.
- The frontend CSP includes `default-src 'self'`, `script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, and the Stellar Horizon `connect-src` allowlist.
- The frontend CSP does **not** contain `'unsafe-inline'` or `'unsafe-eval'`.
- The backend `app.js` sets `defaultSrc: ["'none'"]` and `frameAncestors: ["'none'"]` and does **not** include `scriptSrc`, `styleSrc`, `imgSrc`, `'unsafe-inline'`, or `'unsafe-eval'`.

Run the tests with:

```bash
npm test -- tests/csp.test.js
```

---

### Adding new external origins

If a new external service needs to be reachable from the frontend (e.g. a currency conversion API), add its origin to the `connect-src` directive in `frontend/next.config.js` and update the test in `tests/csp.test.js` accordingly.

Do **not** add `'unsafe-inline'` or `'unsafe-eval'` to `script-src`. If a third-party library requires inline scripts, use a nonce-based approach instead.
