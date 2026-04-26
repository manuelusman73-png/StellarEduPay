'use strict';

/**
 * Parses and validates the ALLOWED_ORIGIN environment variable.
 *
 * Rules:
 *  - Supports a single URL or a comma-separated list of URLs
 *  - Wildcard (*) is allowed in non-production environments
 *  - Wildcard (*) is rejected when NODE_ENV === 'production'
 *  - Each entry must be a valid URL (validated via the URL constructor)
 *  - Whitespace around entries is trimmed
 *  - Falls back to 'http://localhost:3000' when ALLOWED_ORIGIN is not set
 *
 * @returns {string|string[]} A single origin string or an array of origin strings
 * @throws {Error} If the configuration is invalid
 */
function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
  const isProduction = process.env.NODE_ENV === 'production';

  if (raw === '*') {
    if (isProduction) {
      throw new Error('ALLOWED_ORIGIN wildcard (*) is not permitted in production');
    }
    return '*';
  }

  const origins = raw.split(',').map((o) => o.trim()).filter(Boolean);
  for (const origin of origins) {
    try {
      new URL(origin);
    } catch {
      throw new Error(`ALLOWED_ORIGIN contains invalid URL: "${origin}"`);
    }
  }
  return origins.length === 1 ? origins[0] : origins;
}

module.exports = { parseAllowedOrigins };
