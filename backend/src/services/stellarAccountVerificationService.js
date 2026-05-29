'use strict';

const { server } = require('../config/stellarConfig');
const logger = require('../utils/logger').child('StellarAccountVerification');

const HORIZON_CHECK_TIMEOUT_MS = 3000;

/**
 * Verify if a Stellar account exists and is funded on the network.
 *
 * Returns:
 *   { isFunded: true, warning: null }  — account exists and is funded
 *   { isFunded: false, warning: 'STELLAR_ACCOUNT_UNFUNDED' }  — account exists but unfunded
 *   { isFunded: null, warning: null }  — Horizon check failed (timeout/network error)
 *
 * The timeout ensures this check never blocks school creation/updates.
 * Network failures are treated as non-blocking (returns null, null).
 *
 * @param {string} stellarAddress - The Stellar public key to verify
 * @returns {Promise<{ isFunded: boolean|null, warning: string|null }>}
 */
async function verifyStellarAccountFunding(stellarAddress) {
  try {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('Horizon check timeout'));
      }, HORIZON_CHECK_TIMEOUT_MS);
    });

    const horizonPromise = server.accounts().accountId(stellarAddress).call();

    const account = await Promise.race([horizonPromise, timeoutPromise]);
    clearTimeout(timeoutHandle);

    // Account exists on Horizon. Check if it has a balance (funded).
    // An account is considered funded if it has at least 1 XLM (minimum balance).
    const nativeBalance = account.balances.find((b) => b.asset_type === 'native');
    const balance = nativeBalance ? parseFloat(nativeBalance.balance) : 0;

    if (balance >= 1) {
      logger.debug(`Account ${stellarAddress} is funded with ${balance} XLM`);
      return { isFunded: true, warning: null };
    }

    logger.warn(`Account ${stellarAddress} exists but is unfunded (balance: ${balance} XLM)`);
    return { isFunded: false, warning: 'STELLAR_ACCOUNT_UNFUNDED' };
  } catch (err) {
    // 404 means account doesn't exist on Horizon
    if (err.response?.status === 404 || err.status === 404) {
      logger.warn(`Account ${stellarAddress} not found on Stellar network`);
      return { isFunded: false, warning: 'STELLAR_ACCOUNT_UNFUNDED' };
    }

    // Timeout or network error — don't block school creation
    logger.warn(
      `Horizon check failed for ${stellarAddress}: ${err.message}. Proceeding without verification.`
    );
    return { isFunded: null, warning: null };
  }
}

module.exports = {
  verifyStellarAccountFunding,
};
