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

const TRANSACTION_TIME_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

module.exports = { server, networkPassphrase, SCHOOL_WALLET, StellarSdk, TRANSACTION_TIME_WINDOW_MS };
