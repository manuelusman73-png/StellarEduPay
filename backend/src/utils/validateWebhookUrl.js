'use strict';

const dns = require('dns').promises;
const net = require('net');
const { URL } = require('url');

// RFC 1918 private, loopback, link-local, and other reserved IPv4 ranges
const PRIVATE_RANGES = [
  [0x00000000, 0x00FFFFFF], // 0.0.0.0/8
  [0x0A000000, 0x0AFFFFFF], // 10.0.0.0/8
  [0x64400000, 0x647FFFFF], // 100.64.0.0/10 (CGNAT)
  [0x7F000000, 0x7FFFFFFF], // 127.0.0.0/8  (loopback)
  [0xA9FE0000, 0xA9FEFFFF], // 169.254.0.0/16 (link-local / AWS metadata)
  [0xAC100000, 0xAC1FFFFF], // 172.16.0.0/12
  [0xC0000000, 0xC00000FF], // 192.0.0.0/24
  [0xC0A80000, 0xC0A8FFFF], // 192.168.0.0/16
  [0xC6120000, 0xC613FFFF], // 198.18.0.0/15 (benchmarking)
  [0xF0000000, 0xFFFFFFFF], // 240.0.0.0/4 (reserved)
];

function ipv4ToLong(ip) {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

function isPrivateIPv4(ip) {
  const n = ipv4ToLong(ip);
  return PRIVATE_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
}

function isPrivateIPv6(ip) {
  if (ip === '::1') return true;
  const lower = ip.toLowerCase();
  // IPv4-mapped: ::ffff:a.b.c.d
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  // Link-local fe80::/10
  if (lower.startsWith('fe80:')) return true;
  // Loopback prefix
  if (lower.startsWith('::')) return true;
  return false;
}

/**
 * Validate a webhook URL for SSRF safety.
 *
 * Rules:
 *   1. Must use the https: protocol.
 *   2. Hostname must not be localhost / .local / .internal.
 *   3. All resolved IPv4/IPv6 addresses must be public (not RFC 1918, loopback, or link-local).
 *
 * @param {string} url
 * @returns {Promise<{ valid: boolean, reason?: string }>}
 */
async function validateWebhookUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: 'INVALID_WEBHOOK_URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'INVALID_WEBHOOK_URL' };
  }

  const hostname = parsed.hostname;

  // Reject bare IP literals that fall in private ranges
  if (net.isIPv4(hostname)) {
    return isPrivateIPv4(hostname)
      ? { valid: false, reason: 'INVALID_WEBHOOK_URL' }
      : { valid: true };
  }

  // Strip brackets from IPv6 literals (URL parser includes them)
  const rawIPv6 = hostname.replace(/^\[|\]$/g, '');
  if (net.isIPv6(rawIPv6)) {
    return isPrivateIPv6(rawIPv6)
      ? { valid: false, reason: 'INVALID_WEBHOOK_URL' }
      : { valid: true };
  }

  // Reject well-known internal hostnames without a DNS round-trip
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.localhost')
  ) {
    return { valid: false, reason: 'INVALID_WEBHOOK_URL' };
  }

  // DNS resolution check — all returned addresses must be public
  const [v4, v6] = await Promise.all([
    dns.resolve4(hostname).catch(() => []),
    dns.resolve6(hostname).catch(() => []),
  ]);

  const allAddresses = [...v4, ...v6];

  // If DNS returned nothing, reject (cannot confirm the host is reachable publicly)
  if (allAddresses.length === 0) {
    return { valid: false, reason: 'INVALID_WEBHOOK_URL' };
  }

  for (const addr of allAddresses) {
    if (net.isIPv4(addr) && isPrivateIPv4(addr)) {
      return { valid: false, reason: 'INVALID_WEBHOOK_URL' };
    }
    if (net.isIPv6(addr) && isPrivateIPv6(addr)) {
      return { valid: false, reason: 'INVALID_WEBHOOK_URL' };
    }
  }

  return { valid: true };
}

module.exports = { validateWebhookUrl, isPrivateIPv4, isPrivateIPv6 };
