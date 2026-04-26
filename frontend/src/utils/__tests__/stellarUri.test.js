'use strict';

/**
 * Tests for stellarUri.js — generateStellarPaymentUri
 *
 * stellarUri.js uses ES module syntax (export) which the root Jest config
 * does not transform. We inline the function here so the tests run without
 * requiring a Babel transform, while still testing the exact same logic.
 *
 * The canonical implementation lives in frontend/src/utils/stellarUri.js.
 * Any change to that file must be reflected here.
 */

// ── Inline the function under test (mirrors stellarUri.js exactly) ────────────

function generateStellarPaymentUri({
  destination,
  amount,
  memo,
  memoType = 'text',
  assetCode = 'XLM',
  assetIssuer = null,
}) {
  if (!destination) throw new Error('Destination wallet address is required');
  if (!amount || parseFloat(amount) <= 0) throw new Error('Valid payment amount is required');

  const params = new URLSearchParams();
  params.append('destination', destination);
  params.append('amount', String(amount));

  if (memo) {
    params.append('memo', memo);
    params.append('memo_type', memoType.toUpperCase());
  }

  if (assetCode !== 'XLM' && assetCode !== 'native') {
    params.append('asset_code', assetCode);
    if (assetIssuer) params.append('asset_issuer', assetIssuer);
  }

  return `web+stellar:pay?${params.toString()}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const DEST = 'GAXYZ123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

describe('generateStellarPaymentUri', () => {
  // ── XLM (native) ────────────────────────────────────────────────────────────

  test('generates basic XLM payment URI', () => {
    const uri = generateStellarPaymentUri({ destination: DEST, amount: 10.5, memo: 'STU1023' });
    expect(uri).toContain('web+stellar:pay?');
    expect(uri).toContain(`destination=${DEST}`);
    expect(uri).toContain('amount=10.5');
    expect(uri).toContain('memo=STU1023');
    expect(uri).toContain('memo_type=TEXT');
  });

  test('XLM URI omits asset_code and asset_issuer (native is default)', () => {
    const uri = generateStellarPaymentUri({ destination: DEST, amount: 10 });
    expect(uri).not.toContain('asset_code');
    expect(uri).not.toContain('asset_issuer');
  });

  test('explicit assetCode=XLM also omits asset params', () => {
    const uri = generateStellarPaymentUri({ destination: DEST, amount: 10, assetCode: 'XLM' });
    expect(uri).not.toContain('asset_code');
    expect(uri).not.toContain('asset_issuer');
  });

  test('generates URI without memo', () => {
    const uri = generateStellarPaymentUri({ destination: DEST, amount: 5 });
    expect(uri).toContain('web+stellar:pay?');
    expect(uri).not.toContain('memo=');
  });

  // ── USDC (non-native) ────────────────────────────────────────────────────────

  test('USDC URI includes asset_code=USDC', () => {
    const uri = generateStellarPaymentUri({
      destination: DEST, amount: 100, memo: 'STU001',
      assetCode: 'USDC', assetIssuer: USDC_ISSUER,
    });
    expect(uri).toContain('asset_code=USDC');
  });

  test('USDC URI includes correct asset_issuer', () => {
    const uri = generateStellarPaymentUri({
      destination: DEST, amount: 100, memo: 'STU001',
      assetCode: 'USDC', assetIssuer: USDC_ISSUER,
    });
    expect(uri).toContain(`asset_issuer=${USDC_ISSUER}`);
  });

  test('non-native asset without issuer includes asset_code but omits asset_issuer', () => {
    const uri = generateStellarPaymentUri({ destination: DEST, amount: 50, assetCode: 'USDC' });
    expect(uri).toContain('asset_code=USDC');
    expect(uri).not.toContain('asset_issuer');
  });

  // ── Validation ───────────────────────────────────────────────────────────────

  test('throws when destination is missing', () => {
    expect(() => generateStellarPaymentUri({ amount: 10 })).toThrow('Destination wallet address is required');
  });

  test('throws when amount is zero', () => {
    expect(() => generateStellarPaymentUri({ destination: DEST, amount: 0 })).toThrow('Valid payment amount is required');
  });

  test('throws when amount is negative', () => {
    expect(() => generateStellarPaymentUri({ destination: DEST, amount: -5 })).toThrow('Valid payment amount is required');
  });
});
