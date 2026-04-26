import { useState, useEffect } from 'react';
import { fetchXlmPrice, convertXlmToUsd, getCacheStatus } from '../services/currencyService';
import { useFiatConversion } from '../hooks/useFiatConversion';

export default function TestCurrency() {
  const [manualPrice, setManualPrice] = useState(null);
  const [manualConversion, setManualConversion] = useState(null);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [testAmount, setTestAmount] = useState(250);
  
  // Test the hook
  const hookConversion = useFiatConversion(testAmount);

  async function testFetchPrice() {
    const price = await fetchXlmPrice();
    setManualPrice(price);
  }

  async function testConversion() {
    const result = await convertXlmToUsd(testAmount);
    setManualConversion(result);
  }

  function checkCache() {
    const status = getCacheStatus();
    setCacheInfo(status);
  }

  useEffect(() => {
    testFetchPrice();
    testConversion();
  }, [testAmount]);

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', padding: '1rem', fontFamily: 'sans-serif' }}>
      <h1>Currency Conversion Test Page</h1>
      
      <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f5f5f5', borderRadius: 8 }}>
        <h3>Test Amount</h3>
        <input 
          type="number" 
          value={testAmount} 
          onChange={(e) => setTestAmount(parseFloat(e.target.value) || 0)}
          style={{ padding: '0.5rem', fontSize: '1rem', width: '200px' }}
        />
        <span style={{ marginLeft: '0.5rem' }}>XLM</span>
      </div>

      <div style={{ marginBottom: '2rem', padding: '1rem', background: '#e3f2fd', borderRadius: 8 }}>
        <h3>Hook Test (useFiatConversion)</h3>
        <p><strong>Amount:</strong> {testAmount} XLM</p>
        <p><strong>USD:</strong> {hookConversion.loading ? 'Loading...' : hookConversion.usd ? `$${hookConversion.usd.toFixed(2)}` : 'N/A'}</p>
        <p><strong>Rate:</strong> {hookConversion.rate ? `$${hookConversion.rate.toFixed(4)}` : 'N/A'}</p>
        <p><strong>Status:</strong> {hookConversion.loading ? 'Loading' : 'Ready'}</p>
      </div>

      <div style={{ marginBottom: '2rem', padding: '1rem', background: '#fff3e0', borderRadius: 8 }}>
        <h3>Manual Service Test</h3>
        <button onClick={testFetchPrice} style={{ padding: '0.5rem 1rem', marginRight: '0.5rem' }}>
          Fetch XLM Price
        </button>
        <button onClick={testConversion} style={{ padding: '0.5rem 1rem', marginRight: '0.5rem' }}>
          Convert Amount
        </button>
        <button onClick={checkCache} style={{ padding: '0.5rem 1rem' }}>
          Check Cache
        </button>
        
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Current XLM Price:</strong> {manualPrice ? `$${manualPrice.toFixed(4)}` : 'Not fetched'}</p>
          <p><strong>Conversion Result:</strong> {manualConversion?.usd ? `$${manualConversion.usd.toFixed(2)} USD` : 'Not converted'}</p>
          {manualConversion && (
            <p><strong>Cached:</strong> {manualConversion.cached ? 'Yes' : 'No'}</p>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f3e5f5', borderRadius: 8 }}>
        <h3>Cache Status</h3>
        {cacheInfo ? (
          <>
            <p><strong>Cached Price:</strong> {cacheInfo.price ? `$${cacheInfo.price.toFixed(4)}` : 'None'}</p>
            <p><strong>Cache Age:</strong> {cacheInfo.age ? `${Math.floor(cacheInfo.age / 1000)}s` : 'N/A'}</p>
            <p><strong>Valid:</strong> {cacheInfo.valid ? 'Yes' : 'No'}</p>
            <p><strong>TTL:</strong> 5 minutes (300s)</p>
          </>
        ) : (
          <p>Click "Check Cache" to view status</p>
        )}
      </div>

      <div style={{ padding: '1rem', background: '#e8f5e9', borderRadius: 8 }}>
        <h3>Display Format Test</h3>
        <p style={{ fontSize: '1.2rem' }}>
          <strong>Required Fee:</strong> {testAmount} XLM
          {hookConversion?.usd && (
            <span style={{ marginLeft: '0.5rem', color: '#2e7d32' }}>
              (~${hookConversion.usd.toFixed(2)} USD)
            </span>
          )}
        </p>
        {hookConversion?.usd && (
          <p style={{ fontSize: '0.85rem', color: '#666', fontStyle: 'italic' }}>
            Approximate rate: 1 XLM ≈ ${hookConversion.rate.toFixed(4)} USD
            <br />
            <small>Exchange rates are indicative and may vary. Actual value depends on market conditions.</small>
          </p>
        )}
      </div>
    </div>
  );
}
