import React, { useState, useEffect } from 'react';
import './NetworkStatus.css';

/**
 * NetworkStatus Component
 * 
 * Displays the current Stellar network status in the app header
 * with real-time updates and visual indicators.
 */
const NetworkStatus = ({ className = '' }) => {
  const [networkStatus, setNetworkStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchNetworkStatus();
    
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchNetworkStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchNetworkStatus = async () => {
    try {
      const response = await fetch('/api/v1/network/status');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setNetworkStatus(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch network status:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return '#10b981'; // green
      case 'failed': return '#ef4444';  // red
      case 'unknown': return '#f59e0b'; // yellow
      default: return '#6b7280';        // gray
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy': return '✓';
      case 'failed': return '✗';
      case 'unknown': return '?';
      default: return '○';
    }
  };

  const getCongestionColor = (level) => {
    switch (level) {
      case 'normal': return '#10b981';   // green
      case 'moderate': return '#f59e0b'; // yellow
      case 'high': return '#ef4444';     // red
      default: return '#6b7280';         // gray
    }
  };

  if (loading) {
    return (
      <div className={`network-status loading ${className}`}>
        <div className="status-indicator">
          <div className="pulse-dot"></div>
        </div>
        <span className="status-text">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`network-status error ${className}`}>
        <div className="status-indicator" style={{ backgroundColor: '#ef4444' }}>
          ✗
        </div>
        <span className="status-text">Network Error</span>
      </div>
    );
  }

  const { status, isUsingBackup, congestionLevel, healthScore, uptimeFormatted } = networkStatus;

  return (
    <div className={`network-status ${status} ${className}`}>
      <div 
        className="status-summary"
        onClick={() => setExpanded(!expanded)}
        title="Click for details"
      >
        <div 
          className="status-indicator"
          style={{ backgroundColor: getStatusColor(status) }}
        >
          {getStatusIcon(status)}
        </div>
        
        <div className="status-info">
          <span className="status-text">
            Stellar Network
            {isUsingBackup && <span className="backup-indicator"> (Backup)</span>}
          </span>
          <div className="health-score">
            Health: {healthScore}%
          </div>
        </div>
        
        <div className="expand-arrow">
          {expanded ? '▼' : '▶'}
        </div>
      </div>

      {expanded && (
        <div className="status-details">
          <div className="detail-grid">
            <div className="detail-item">
              <label>Status:</label>
              <span className={`status-badge ${status}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
            
            <div className="detail-item">
              <label>Server:</label>
              <span className="server-url">
                {networkStatus.currentServer}
                {isUsingBackup && <span className="backup-tag">BACKUP</span>}
              </span>
            </div>
            
            <div className="detail-item">
              <label>Congestion:</label>
              <span 
                className="congestion-level"
                style={{ color: getCongestionColor(congestionLevel) }}
              >
                {congestionLevel.charAt(0).toUpperCase() + congestionLevel.slice(1)}
              </span>
            </div>
            
            <div className="detail-item">
              <label>Uptime:</label>
              <span>{uptimeFormatted}</span>
            </div>
            
            {networkStatus.ledgerInfo && (
              <>
                <div className="detail-item">
                  <label>Latest Ledger:</label>
                  <span>#{networkStatus.ledgerInfo.sequence}</span>
                </div>
                
                <div className="detail-item">
                  <label>Last Close:</label>
                  <span>{Math.round(networkStatus.ledgerInfo.timeSinceClose / 1000)}s ago</span>
                </div>
              </>
            )}
            
            {networkStatus.transactionFailureRate > 0 && (
              <div className="detail-item">
                <label>TX Failure Rate:</label>
                <span className="failure-rate">
                  {(networkStatus.transactionFailureRate * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          
          {networkStatus.errors && networkStatus.errors.length > 0 && (
            <div className="recent-errors">
              <h4>Recent Issues:</h4>
              <ul>
                {networkStatus.errors.slice(0, 3).map((error, index) => (
                  <li key={index}>
                    <span className="error-time">
                      {new Date(error.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="error-message">{error.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="status-actions">
            <button 
              className="refresh-btn"
              onClick={(e) => {
                e.stopPropagation();
                fetchNetworkStatus();
              }}
            >
              Refresh
            </button>
            
            <span className="last-updated">
              Updated: {new Date(networkStatus.lastHealthCheck).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkStatus;