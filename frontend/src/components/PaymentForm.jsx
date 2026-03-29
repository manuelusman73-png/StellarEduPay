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
    <div className="container-sm">
      <h2>Pay School Fees</h2>

      <form onSubmit={handleSubmit}>
        <label htmlFor="studentIdInput" className="input-label">
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
          className="input-field mb-0-5"
        />
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Loading...' : 'Get Payment Instructions'}
        </button>
      </form>

      {error && (
        <p 
          id="errorMessage"
          ref={errorRef}
          role="alert"
          className="alert-error"
          tabIndex="-1"
        >
          {error}
        </p>
      )}

      {student && instructions && (
        <div className="card">
          <p><strong>Student:</strong> {student.name} — Class {student.class}</p>

          <p className="my-0-4">
            <strong>Required Fee:</strong>{' '}
            {instructions.feeAmount != null ? `${instructions.feeAmount} XLM` : `${student.feeAmount} XLM`}
            {local && (
              <span className="ml-0-5 text-success">
                ≈ {local.amount.toFixed(2)} {local.currency}
              </span>
            )}
          </p>

          {local && rateTime && (
            <p className="mb-0-5 text-muted">
              Rate as of {rateTime} · 1 XLM = {local.rate.toFixed(4)} {local.currency}
            </p>
          )}
          {!local && instructions.feeAmount != null && (
            <p className="mb-0-5 text-muted">
              Local currency rate unavailable
            </p>
          )}

          <p><strong>Status:</strong> {student.feePaid ? '✅ Paid' : '❌ Unpaid'}</p>
          <hr />

          <div className="mb-1">
            <label htmlFor="walletAddress" className="input-label mb-0-25">
              Send payment to:
            </label>
            <div className="flex-row">
              <code 
                id="walletAddress"
                className="code-block"
              >
                {instructions.walletAddress}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(instructions.walletAddress, 'wallet')}
                aria-label="Copy wallet address"
                title="Copy wallet address"
                className="btn-copy"
              >
                {copiedField === 'wallet' ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="mb-1">
            <label htmlFor="memoField" className="input-label mb-0-25">
              Memo (required):
            </label>
            <div className="flex-row">
              <code 
                id="memoField"
                className="code-block"
              >
                {instructions.memo}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(instructions.memo, 'memo')}
                aria-label="Copy memo"
                title="Copy memo"
                className="btn-copy"
              >
                {copiedField === 'memo' ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {instructions.acceptedAssets?.length > 0 && (
            <div className="badge-success">
              <strong>Accepted Assets:</strong>
              <ul className="list-unstyled">
                {instructions.acceptedAssets.map(a => (
                  <li key={a.code}>{a.displayName} ({a.code})</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-muted mt-1">
            {instructions.note}
          </p>
        </div>
      )}

      {payments !== null && (
        <div className="mt-1-5">
          <h3 className="mb-0-75">Payment History</h3>
          {payments.length === 0 ? (
            <p className="text-muted italic">No payments recorded yet.</p>
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