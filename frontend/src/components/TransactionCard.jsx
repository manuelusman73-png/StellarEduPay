/**
 * TransactionCard — displays a single payment record.
 *
 * Shows both the XLM/USDC amount and the local currency equivalent when available.
 * If the price feed was unavailable at verification time, only the asset amount is shown.
 * Supports dispute flagging inline.
 */
import { useState } from 'react';
import { flagDispute } from '../services/api';

export default function TransactionCard({ payment, schoolId, schoolSlug }) {
  const {
    txHash,
    amount,
    assetCode = 'XLM',
    confirmedAt,
    studentId,
    localCurrency,
    explorerUrl,
    dispute,        // optional: pre-fetched dispute record for this payment
  } = payment;

  const [disputeState, setDisputeState]   = useState(dispute || null);
  const [showForm, setShowForm]           = useState(false);
  const [raisedBy, setRaisedBy]           = useState('');
  const [reason, setReason]               = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [error, setError]                 = useState(null);

  const formattedAmount = `${parseFloat(amount).toFixed(7)} ${assetCode}`;
  const formattedDate   = confirmedAt ? new Date(confirmedAt).toLocaleString() : '—';

  const hasLocal  = localCurrency?.available && localCurrency?.amount != null;
  const rateTime  = localCurrency?.rateTimestamp
    ? new Date(localCurrency.rateTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const disputeStatusColor = {
    open:         '#e65100',
    under_review: '#1565c0',
    resolved:     '#2e7d32',
    rejected:     '#757575',
  };

  async function handleFlagDispute(e) {
    e.preventDefault();
    if (!raisedBy.trim() || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const headers = {};
      if (schoolId)   headers['X-School-ID']   = schoolId;
      if (schoolSlug) headers['X-School-Slug'] = schoolSlug;

      const { data } = await flagDispute({ txHash, studentId, raisedBy, reason });
      setDisputeState(data);
      setShowForm(false);
      setRaisedBy('');
      setReason('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit dispute.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        border: disputeState ? '1px solid #e65100' : '1px solid #ddd',
        borderRadius: 8,
        padding: '0.75rem 1rem',
        marginBottom: '0.5rem',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Amount row */}
      <p style={{ margin: 0 }}>
        <strong>Amount:</strong>{' '}
        {formattedAmount}
        {hasLocal && (
          <span style={{ marginLeft: '0.5rem', color: '#2e7d32', fontSize: '0.9rem' }}>
            ≈ {localCurrency.amount.toFixed(2)} {localCurrency.currency}
          </span>
        )}
        {!hasLocal && localCurrency && (
          <span style={{ marginLeft: '0.5rem', color: '#999', fontSize: '0.8rem' }}>
            (rate unavailable)
          </span>
        )}
      </p>

      {/* Rate freshness */}
      {hasLocal && rateTime && (
        <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: '#aaa' }}>
          Rate as of {rateTime}
        </p>
      )}

      {/* Transaction hash + explorer link */}
      <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#555' }}>
        <strong>Tx:</strong>{' '}
        <code style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>{txHash}</code>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#1565c0' }}
            aria-label="View transaction on Stellar Expert"
          >
            View on Explorer ↗
          </a>
        )}
      </p>

      {/* Date + student */}
      <p style={{ margin: 0, fontSize: '0.85rem', color: '#888' }}>
        {formattedDate} — Student {studentId}
      </p>

      {/* ── Dispute section ─────────────────────────────────────────────── */}
      {disputeState ? (
        <p
          style={{
            margin: '0.5rem 0 0',
            fontSize: '0.8rem',
            color: disputeStatusColor[disputeState.status] || '#555',
          }}
          aria-label={`Dispute status: ${disputeState.status}`}
        >
          ⚑ Dispute {disputeState.status.replace('_', ' ')}
          {disputeState.resolutionNote && ` — ${disputeState.resolutionNote}`}
        </p>
      ) : (
        <div style={{ marginTop: '0.5rem' }}>
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              style={{
                fontSize: '0.78rem',
                color: '#e65100',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
              aria-label="Flag this payment as disputed"
            >
              Flag as disputed
            </button>
          ) : (
            <form onSubmit={handleFlagDispute} style={{ marginTop: '0.25rem' }}>
              <input
                type="text"
                placeholder="Your name"
                value={raisedBy}
                onChange={(e) => setRaisedBy(e.target.value)}
                required
                style={{ display: 'block', width: '100%', marginBottom: '0.25rem', fontSize: '0.8rem', padding: '0.2rem 0.4rem' }}
                aria-label="Your name"
              />
              <textarea
                placeholder="Describe the issue"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={2}
                style={{ display: 'block', width: '100%', marginBottom: '0.25rem', fontSize: '0.8rem', padding: '0.2rem 0.4rem', resize: 'vertical' }}
                aria-label="Dispute reason"
              />
              {error && (
                <p style={{ color: '#c62828', fontSize: '0.78rem', margin: '0 0 0.25rem' }} role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                style={{ fontSize: '0.78rem', marginRight: '0.5rem', cursor: 'pointer' }}
              >
                {submitting ? 'Submitting…' : 'Submit dispute'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(null); }}
                style={{ fontSize: '0.78rem', cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline' }}
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
