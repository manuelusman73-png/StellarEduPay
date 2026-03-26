#!/usr/bin/env node
/**
 * Generates a new Stellar keypair for use as the school wallet.
 * Copy the Public Key into your .env as SCHOOL_WALLET_ADDRESS.
 * Keep the Secret Key offline — the backend never needs it.
 *
 * Run from the project root after installing backend dependencies:
 *   node scripts/create-school-wallet.js
 */

const https = require('https');
const { Keypair } = require('./backend/node_modules/@stellar/stellar-sdk');

function fundTestnetAccount(publicKey) {
  const url = `https://friendbot.stellar.org/?addr=${encodeURIComponent(publicKey)}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Friendbot error ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const pair = Keypair.random();

  console.log('\nGenerated Stellar Keypair:');
  console.log('─────────────────────────────────────────────────────────');
  console.log('Public Key: ', pair.publicKey());
  console.log('Secret Key: ', pair.secret());
  console.log('─────────────────────────────────────────────────────────');

  console.log('\n⚠️  Save the secret key securely! The backend only needs the public key.');

  console.log('\nFunding the account on Stellar testnet via friendbot...');

  try {
    const result = await fundTestnetAccount(pair.publicKey());
    console.log('✅ Testnet account funded successfully:', result.hash);
  } catch (err) {
    console.error('❌ Failed to fund testnet account:', err.message);
    console.error('You can retry funding manually using:');
    console.error(`https://friendbot.stellar.org/?addr=${pair.publicKey()}`);
  }

  console.log('\nCopy the public key into your .env as SCHOOL_WALLET_ADDRESS.');
  console.log('\nYou may keep the secret key only in a secure store.');
}

main().catch((err) => {
  console.error('Unexpected error creating/funding wallet:', err);
  process.exit(1);
});
