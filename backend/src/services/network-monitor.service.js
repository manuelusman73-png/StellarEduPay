'use strict';

/**
 * Stellar Network Monitoring Service
 * 
 * Monitors Horizon server health, implements automatic failover,
 * tracks ledger progression, detects network congestion, and
 * provides network status information for the frontend.
 */

const EventEmitter = require('events');
const { primaryServer, backupServer, horizonConfig } = require('../config/horizon.config');
const { setCurrentServer } = require('../config/stellarConfig');
const logger = require('../utils/logger').child('NetworkMonitor');

class NetworkMonitorService extends EventEmitter {
  constructor() {
    super();
    
    this.currentServer = primaryServer;
    this.isUsingBackup = false;
    this.healthCheckTimer = null;
    this.lastLedgerTime = null;
    this.lastLedgerSequence = null;
    this.networkStatus = {
      status: 'unknown',
      currentServer: horizonConfig.servers[0],
      isUsingBackup: false,
      lastHealthCheck: null,
      ledgerInfo: null,
      congestionLevel: 'normal',
      transactionFailureRate: 0,
      uptime: 0,
      errors: [],
    };
    
    // Transaction failure tracking
    this.transactionStats = {
      total: 0,
      failed: 0,
      windowStart: Date.now(),
      windowSize: 300000, // 5 minutes
    };
    
    this.startTime = Date.now();
  }

  /**
   * Start network monitoring
   */
  start() {
    logger.info('Starting network monitoring service');
    
    // Set initial server
    setCurrentServer(this.currentServer);
    
    // Initial health check
    this.performHealthCheck();
    
    // Schedule regular health checks
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, horizonConfig.healthCheckInterval);
    
    this.emit('started');
  }

  /**
   * Stop network monitoring
   */
  stop() {
    logger.info('Stopping network monitoring service');
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    this.emit('stopped');
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const startTime = Date.now();
    
    try {
      // Test current server
      const isHealthy = await this.checkServerHealth(this.currentServer);
      
      if (isHealthy) {
        await this.updateNetworkStatus('healthy');
        
        // If we were using backup, try to switch back to primary
        if (this.isUsingBackup && backupServer) {
          const primaryHealthy = await this.checkServerHealth(primaryServer);
          if (primaryHealthy) {
            await this.switchToPrimary();
          }
        }
      } else {
        // Current server is unhealthy, try failover
        await this.handleServerFailure();
      }
      
      // Update uptime
      this.networkStatus.uptime = Date.now() - this.startTime;
      this.networkStatus.lastHealthCheck = new Date().toISOString();
      
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      await this.updateNetworkStatus('error', error.message);
    }
    
    const duration = Date.now() - startTime;
    logger.debug(`Health check completed in ${duration}ms`);
  }

  /**
   * Check if a Horizon server is healthy
   */
  async checkServerHealth(server) {
    try {
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), horizonConfig.failoverTimeout)
      );
      
      // Test basic connectivity and get latest ledger
      const ledgerPromise = server.ledgers().order('desc').limit(1).call();
      const ledgerResponse = await Promise.race([ledgerPromise, timeout]);
      
      if (!ledgerResponse.records || ledgerResponse.records.length === 0) {
        throw new Error('No ledger data received');
      }
      
      const latestLedger = ledgerResponse.records[0];
      const ledgerTime = new Date(latestLedger.closed_at);
      const now = new Date();
      const timeDiff = now - ledgerTime;
      
      // Check for ledger stalls
      if (timeDiff > horizonConfig.ledgerStallThreshold) {
        throw new Error(`Ledger stalled: ${timeDiff}ms behind`);
      }
      
      // Update ledger tracking
      this.updateLedgerInfo(latestLedger);
      
      // Check network congestion
      this.checkNetworkCongestion(latestLedger);
      
      return true;
      
    } catch (error) {
      logger.warn('Server health check failed', { 
        server: server.serverURL.toString(),
        error: error.message 
      });
      return false;
    }
  }

  /**
   * Handle server failure and attempt failover
   */
  async handleServerFailure() {
    logger.warn('Current server failed, attempting failover');
    
    if (!this.isUsingBackup && backupServer) {
      // Try to switch to backup server
      const backupHealthy = await this.checkServerHealth(backupServer);
      
      if (backupHealthy) {
        await this.switchToBackup();
        return;
      }
    }
    
    // Both servers failed or no backup available
    await this.updateNetworkStatus('failed', 'All Horizon servers unavailable');
    this.emit('allServersFailed');
  }

  /**
   * Switch to backup server
   */
  async switchToBackup() {
    if (!backupServer) {
      throw new Error('No backup server configured');
    }
    
    logger.info('Switching to backup Horizon server');
    
    this.currentServer = backupServer;
    this.isUsingBackup = true;
    this.networkStatus.currentServer = horizonConfig.servers[1];
    this.networkStatus.isUsingBackup = true;
    
    // Update stellar config
    setCurrentServer(this.currentServer);
    
    await this.updateNetworkStatus('healthy', 'Using backup server');
    this.emit('failoverToBackup');
  }

  /**
   * Switch back to primary server
   */
  async switchToPrimary() {
    logger.info('Switching back to primary Horizon server');
    
    this.currentServer = primaryServer;
    this.isUsingBackup = false;
    this.networkStatus.currentServer = horizonConfig.servers[0];
    this.networkStatus.isUsingBackup = false;
    
    // Update stellar config
    setCurrentServer(this.currentServer);
    
    await this.updateNetworkStatus('healthy', 'Back to primary server');
    this.emit('failoverToPrimary');
  }

  /**
   * Update ledger information
   */
  updateLedgerInfo(ledger) {
    const ledgerTime = new Date(ledger.closed_at);
    
    this.networkStatus.ledgerInfo = {
      sequence: ledger.sequence,
      hash: ledger.hash,
      closedAt: ledger.closed_at,
      transactionCount: ledger.transaction_count,
      operationCount: ledger.operation_count,
      timeSinceClose: Date.now() - ledgerTime.getTime(),
    };
    
    // Detect ledger progression issues
    if (this.lastLedgerSequence && ledger.sequence <= this.lastLedgerSequence) {
      logger.warn('Ledger sequence not progressing', {
        current: ledger.sequence,
        previous: this.lastLedgerSequence,
      });
    }
    
    this.lastLedgerTime = ledgerTime;
    this.lastLedgerSequence = ledger.sequence;
  }

  /**
   * Check for network congestion indicators
   */
  checkNetworkCongestion(ledger) {
    const avgCloseTime = ledger.close_time || 5; // Default 5 seconds
    
    if (avgCloseTime > horizonConfig.congestionThreshold / 1000) {
      this.networkStatus.congestionLevel = 'high';
      logger.warn('High network congestion detected', { avgCloseTime });
    } else if (avgCloseTime > (horizonConfig.congestionThreshold / 1000) * 0.7) {
      this.networkStatus.congestionLevel = 'moderate';
    } else {
      this.networkStatus.congestionLevel = 'normal';
    }
  }

  /**
   * Record transaction submission result
   */
  recordTransactionResult(success) {
    const now = Date.now();
    
    // Reset window if needed
    if (now - this.transactionStats.windowStart > this.transactionStats.windowSize) {
      this.transactionStats = {
        total: 0,
        failed: 0,
        windowStart: now,
        windowSize: this.transactionStats.windowSize,
      };
    }
    
    this.transactionStats.total++;
    if (!success) {
      this.transactionStats.failed++;
    }
    
    // Calculate failure rate
    const failureRate = this.transactionStats.total > 0 
      ? this.transactionStats.failed / this.transactionStats.total 
      : 0;
    
    this.networkStatus.transactionFailureRate = failureRate;
    
    // Alert on high failure rate
    if (failureRate > horizonConfig.transactionFailureThreshold) {
      logger.warn('High transaction failure rate detected', { 
        failureRate: (failureRate * 100).toFixed(2) + '%',
        failed: this.transactionStats.failed,
        total: this.transactionStats.total,
      });
      this.emit('highFailureRate', failureRate);
    }
  }

  /**
   * Update network status
   */
  async updateNetworkStatus(status, message = null) {
    this.networkStatus.status = status;
    
    if (message) {
      this.networkStatus.errors = [
        { message, timestamp: new Date().toISOString() },
        ...this.networkStatus.errors.slice(0, 9), // Keep last 10 errors
      ];
    }
    
    this.emit('statusUpdate', this.networkStatus);
  }

  /**
   * Get current network status
   */
  getNetworkStatus() {
    return { ...this.networkStatus };
  }

  /**
   * Get current Horizon server
   */
  getCurrentServer() {
    return this.currentServer;
  }

  /**
   * Force failover for testing
   */
  async forceFailover() {
    logger.info('Forcing failover for testing');
    await this.handleServerFailure();
  }
}

// Create singleton instance
const networkMonitor = new NetworkMonitorService();

module.exports = {
  NetworkMonitorService,
  networkMonitor,
};