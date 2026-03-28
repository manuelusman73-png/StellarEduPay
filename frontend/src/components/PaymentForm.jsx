import { useState, useRef } from 'react';
import { getStudent, getPaymentInstructions, getStudentPayments } from '../services/api';
import TransactionCard from './TransactionCard';

export default function PaymentForm() {
  const [studentId, setStudentId]       = useState('');
  const [student, setStudent]           = useState(null);
  const [instructions, setInstructions] = useState(null);
  const [payments, setPayments]         = useState(null);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [copiedField, setCopiedField]   = useState(null);
  const errorRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const [stuRes, instrRes, paymentsRes] = await Promise.all([
        getStudent(studentId),
        getPaymentInstructions(studentId),
        getStudentPayments(studentId),
      ]);
      setStudent(stuRes.data);
      setInstructions(instrRes.data);
      setPayments(paymentsRes.data ?? []);
    } catch {
      setError('Student not found. Please check the ID.');
      errorRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(text, fieldName) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  const local    = instructions?.feeLocalEquivalent;
  const rateTime = local?.rateTimestamp
    ? new Date(local.rateTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div style={{ maxWidth: 480, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h2>Pay School Fees</h2>

      <form onSubmit={handleSubmit}>
        <label htmlFor="studentIdInput" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
          Student ID
        </label>
        <input
          id="studentIdInput"
          type="text"
          placeholder="e.g. STU1023"
          value={studentId}
          onChange={e => setStudentId(e.target.value)}
          required
          aria-required="true"
          aria-describedby={error ? 'errorMessage' : undefined}
          style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', boxSizing: 'border-box' }}
        />
        <button type="submit" disabled={loading} style={{ padding: '0.5rem 1rem' }}>
          {loading ? 'Loading...' : 'Get Payment Instructions'}
        </button>
      </form>

      {error && (
        <p 
          id="errorMessage"
          ref={errorRef}
          role="alert"
          style={{ color: 'red', marginTop: '0.5rem' }}
          tabIndex="-1"
        >
          {error}
        </p>
      )}

      {student && instructions && (
        <div style={{ marginTop: '1.5rem', background: '#f5f5f5', padding: '1rem', borderRadius: 8 }}>
          <p><strong>Student:</strong> {student.name} — Class {student.class}</p>

          {/* Fee amount with local currency equivalent */}
          <p style={{ margin: '0.4rem 0' }}>
            <strong>Required Fee:</strong>{' '}
            {instructions.feeAmount != null ? `${instructions.feeAmount} XLM` : `${student.feeAmount} XLM`}
            {local && (
              <span style={{ marginLeft: '0.5rem', color: '#2e7d32', fontWeight: 500 }}>
                ≈ {local.amount.toFixed(2)} {local.currency}
              </span>
            )}
          </p>

          {/* Rate freshness note */}
          {local && rateTime && (
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.75rem', color: '#999' }}>
              Rate as of {rateTime} · 1 XLM = {local.rate.toFixed(4)} {local.currency}
            </p>
          )}
          {!local && instructions.feeAmount != null && (
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.75rem', color: '#bbb' }}>
              Local currency rate unavailable
            </p>
          )}

          <p><strong>Status:</strong> {student.feePaid ? '✅ Paid' : '❌ Unpaid'}</p>
          <hr />

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="walletAddress" style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>
              Send payment to:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <code 
                id="walletAddress"
                style={{ 
                  wordBreak: 'break-all', 
                  flex: 1, 
                  padding: '0.5rem', 
                  background: 'white', 
                  borderRadius: 4,
                  border: '1px solid #ddd'
                }}
              >
                {instructions.walletAddress}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(instructions.walletAddress, 'wallet')}
                aria-label="Copy wallet address"
                title="Copy wallet address"
                style={{
                  padding: '0.5rem 0.75rem',
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  whiteSpace: 'nowrap'
                }}
              >
                {copiedField === 'wallet' ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="memoField" style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>
              Memo (required):
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <code 
                id="memoField"
                style={{ 
                  flex: 1, 
                  padding: '0.5rem', 
                  background: 'white', 
                  borderRadius: 4,
                  border: '1px solid #ddd'
                }}
              >
                {instructions.memo}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(instructions.memo, 'memo')}
                aria-label="Copy memo"
                title="Copy memo"
                style={{
                  padding: '0.5rem 0.75rem',
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  whiteSpace: 'nowrap'
                }}
              >
                {copiedField === 'memo' ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {instructions.acceptedAssets?.length > 0 && (
            <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: '#e8f5e9', borderRadius: 4 }}>
              <strong>Accepted Assets:</strong>
              <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                {instructions.acceptedAssets.map(a => (
                  <li key={a.code}>{a.displayName} ({a.code})</li>
                ))}
              </ul>
            </div>
          )}

          <p style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.75rem' }}>
            {instructions.note}
          </p>
        </div>
      )}

      {payments !== null && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Payment History</h3>
          {payments.length === 0 ? (
            <p style={{ color: '#888', fontStyle: 'italic' }}>No payments recorded yet.</p>
          ) : (
            payments.map(p => (
              <TransactionCard key={p.txHash || p._id} payment={p} />
            ))
          )}
        </div>
      )}
    </div>
  );
}