const StellarSdk = require('@stellar/stellar-sdk');

const isTestnet = process.env.STELLAR_NETWORK !== 'mainnet';

const server = new StellarSdk.Horizon.Server(
  isTestnet
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org'
);

const networkPassphrase = isTestnet
  ? StellarSdk.Networks.TESTNET
  : StellarSdk.Networks.PUBLIC;

const SCHOOL_WALLET = process.env.SCHOOL_WALLET_ADDRESS;

// Accepted assets configuration — add new assets here to support them
const ACCEPTED_ASSETS = {
  XLM: {
    code: 'XLM',
    type: 'native',
    issuer: null,
    displayName: 'Stellar Lumens',
    decimals: 7,
  },
  USDC: {
    code: 'USDC',
    type: 'credit_alphanum4',
    issuer: isTestnet
      ? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
      : 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    displayName: 'USD Coin',
    decimals: 7,
  },
};

/**
 * Check whether an asset (by code and type) is accepted by the system.
 * @param {string} assetCode  e.g. 'XLM', 'USDC'
 * @param {string} assetType  Stellar asset type string ('native', 'credit_alphanum4', …)
 * @returns {{ accepted: boolean, asset: object|null }}
 */
function isAcceptedAsset(assetCode, assetType) {
  const asset = ACCEPTED_ASSETS[assetCode];
  if (!asset) return { accepted: false, asset: null };
  if (asset.type !== assetType) return { accepted: false, asset: null };
  return { accepted: true, asset };
}

/**
 * Resolve a Stellar SDK Asset from an accepted‐asset code.
 */
function resolveAsset(assetCode) {
  const cfg = ACCEPTED_ASSETS[assetCode];
  if (!cfg) return null;
  if (cfg.type === 'native') return StellarSdk.Asset.native();
  return new StellarSdk.Asset(cfg.code, cfg.issuer);
}

// Minimum number of ledgers that must be closed after a transaction's ledger
// before it is considered final. Stellar closes a ledger ~every 5 seconds;
// 2 ledgers ≈ 10 seconds of additional safety margin.
const CONFIRMATION_THRESHOLD = parseInt(process.env.CONFIRMATION_THRESHOLD || '2', 10);

module.exports = {
  server,
  networkPassphrase,
  SCHOOL_WALLET,
  StellarSdk,
  ACCEPTED_ASSETS,
  CONFIRMATION_THRESHOLD,
  isAcceptedAsset,
  resolveAsset,
};
