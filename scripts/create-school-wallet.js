#!/usr/bin/env node
/**
 * Generates a new Stellar keypair for use as the school wallet.
 * Copy the Public Key into your .env as SCHOOL_WALLET_ADDRESS.
 * Keep the Secret Key offline — the backend never needs it.
 *
 * Run from the project root after installing backend dependencies:
 *   node scripts/create-school-wallet.js
 */

const { Keypair } = require('./backend/node_modules/@stellar/stellar-sdk');

const pair = Keypair.random();

console.log('\nGenerated Stellar Keypair:');
console.log('─────────────────────────────────────────────────────────');
console.log('Public Key: ', pair.publicKey());
console.log('Secret Key: ', pair.secret());
console.log('─────────────────────────────────────────────────────────');
console.log('\n⚠️  Save the secret key securely! The backend only needs the public key.');
console.log('\nTo fund this account on testnet, visit:');
console.log('https://laboratory.stellar.org/#account-creator?network=test\n');
