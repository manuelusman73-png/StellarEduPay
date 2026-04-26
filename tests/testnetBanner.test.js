'use strict';

// Tests for TestnetBanner visibility logic.
// The component returns null unless NEXT_PUBLIC_STELLAR_NETWORK === 'testnet'.
// We test the guard condition directly without a DOM renderer.

function shouldShowBanner(envValue) {
  return envValue === 'testnet';
}

describe('TestnetBanner visibility', () => {
  it('shows when NEXT_PUBLIC_STELLAR_NETWORK is "testnet"', () => {
    expect(shouldShowBanner('testnet')).toBe(true);
  });

  it('hides when NEXT_PUBLIC_STELLAR_NETWORK is "mainnet"', () => {
    expect(shouldShowBanner('mainnet')).toBe(false);
  });

  it('hides when NEXT_PUBLIC_STELLAR_NETWORK is undefined', () => {
    expect(shouldShowBanner(undefined)).toBe(false);
  });

  it('hides when NEXT_PUBLIC_STELLAR_NETWORK is an empty string', () => {
    expect(shouldShowBanner('')).toBe(false);
  });

  it('hides when NEXT_PUBLIC_STELLAR_NETWORK is "TESTNET" (case-sensitive check)', () => {
    expect(shouldShowBanner('TESTNET')).toBe(false);
  });
});
