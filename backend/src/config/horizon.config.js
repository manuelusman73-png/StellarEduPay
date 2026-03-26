'use strict';

const StellarSdk = require('@stellar/stellar-sdk');
const config = require('./index');
const logger = require('../utils/logger').child('HorizonConfig');

/**
 * Horizon Server Configuration with Failover Support
 * 
 * Provides primary and backup Horizon servers with automatic failover
 * capabilities for improved reliability and uptime.
 */

// Default Horizon servers for testnet and mainnet
const DEFAULT_SERVERS = {
  testnet: [
    'https://horizon-testnet.stellar.org',
    'https://horizon-testnet.stellar.org', // Backup (same for now)
  ],
  mainnet: [
    'https://horizon.stellar.org',
    'https://horizon.stellar.org', // Backup (same for now)
  ]
};

// Custom servers from environment variables
const CUSTOM_SERVERS = {
  primary: process.env.HORIZON_PRIMARY_URL,
  backup: process.env.HORIZON_BACKUP_URL,
};

/**
 * Get Horizon server URLs for the current network
 */
function getHorizonServers() {
  const network = config.IS_TESTNET ? 'testnet' : 'mainnet';
  
  // Use custom servers if provided, otherwise use defaults
  const servers = [];
  
  if (CUSTOM_SERVERS.primary) {
    servers.push(CUSTOM_SERVERS.primary);
  } else {
    servers.push(DEFAULT_SERVERS[network][0]);
  }
  
  if (CUSTOM_SERVERS.backup) {
    servers.push(CUSTOM_SERVERS.backup);
  } else if (DEFAULT_SERVERS[network][1] !== servers[0]) {
    servers.push(DEFAULT_SERVERS[network][1]);
  }
  
  return servers;
}

/**
 * Create Horizon server instance with timeout configuration
 */
function createHorizonServer(url) {
  return new StellarSdk.Horizon.Server(url, {
    timeout: config.STELLAR_TIMEOUT_MS || 10000,
    allowHttp: process.env.NODE_ENV === 'development' && url.startsWith('http://'),
  });
}

/**
 * Horizon server configuration
 */
const horizonConfig = {
  servers: getHorizonServers(),
  timeout: config.STELLAR_TIMEOUT_MS || 10000,
  healthCheckInterval: parseInt(process.env.HORIZON_HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
  failoverTimeout: parseInt(process.env.HORIZON_FAILOVER_TIMEOUT) || 5000, // 5 seconds
  maxRetries: parseInt(process.env.HORIZON_MAX_RETRIES) || 3,
  
  // Network monitoring thresholds
  ledgerStallThreshold: parseInt(process.env.LEDGER_STALL_THRESHOLD) || 60000, // 1 minute
  congestionThreshold: parseInt(process.env.NETWORK_CONGESTION_THRESHOLD) || 1000, // ms
  transactionFailureThreshold: parseFloat(process.env.TX_FAILURE_THRESHOLD) || 0.1, // 10%
};

/**
 * Create primary and backup server instances
 */
const primaryServer = createHorizonServer(horizonConfig.servers[0]);
const backupServer = horizonConfig.servers[1] ? createHorizonServer(horizonConfig.servers[1]) : null;

logger.info('Horizon configuration initialized', {
  primary: horizonConfig.servers[0],
  backup: horizonConfig.servers[1] || 'none',
  network: config.IS_TESTNET ? 'testnet' : 'mainnet',
  timeout: horizonConfig.timeout,
});

module.exports = {
  horizonConfig,
  primaryServer,
  backupServer,
  createHorizonServer,
  getHorizonServers,
};