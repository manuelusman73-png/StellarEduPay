import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import SyncButton from '../components/SyncButton';
import { getSyncStatus, getStudents } from '../services/api';

function timeAgo(isoString) {
  if (!isoString) return 'Never';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  return new Date(isoString).toLocaleString();
}

const PAGE_SIZE = 20;

export default function Dashboard() {
  const [lastSyncAt, setLastSyncAt]   = useState(null);
  const [syncMessage, setSyncMessage] = useState(null);
  const [students, setStudents]       = useState([]);
  const [total, setTotal]             = useState(0);
  const [pages, setPages]             = useState(1);
  const [page, setPage]               = useState(1);
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    getSyncStatus()
      .then(({ data }) => setLastSyncAt(data.lastSyncAt))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    getStudents(page, PAGE_SIZE)
      .then(({ data }) => {
        setStudents(data.students);
        setTotal(data.total);
        setPages(data.pages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  function handleSyncComplete(data) {
    setLastSyncAt(new Date().toISOString());
    setSyncMessage(data?.message || 'Sync complete.');
    setPage(1); // refresh from first page after sync
  }

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 900, margin: '2rem auto', fontFamily: 'sans-serif', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
          <SyncButton onSyncComplete={handleSyncComplete} lastSyncTime={lastSyncAt} />
        </div>

        {syncMessage && (
          <p style={{ color: '#2e7d32', background: '#f1f8e9', padding: '0.6rem 1rem', borderRadius: 6, fontSize: '0.9rem' }}
             role="status">
            ✓ {syncMessage}
          </p>
        )}

        <p style={{ fontSize: '0.85rem', color: '#888' }}>
          Last synced: <strong>{timeAgo(lastSyncAt)}</strong>
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '1.5rem 0 0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Students {total > 0 && <span style={{ color: '#888', fontWeight: 400 }}>({total} total)</span>}</h2>
        </div>

        {loading ? (
          <p style={{ color: '#888' }}>Loading…</p>
        ) : students.length === 0 ? (
          <p style={{ color: '#888' }}>No students found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0.75rem' }}>ID</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Name</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Class</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Fee</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.studentId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{s.studentId}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{s.name}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{s.class}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{s.feeAmount}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{s.feePaid ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pages > 1 && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1rem' }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '0.3rem 0.75rem', cursor: page === 1 ? 'default' : 'pointer' }}>
              ← Prev
            </button>
            <span style={{ fontSize: '0.85rem', color: '#555' }}>Page {page} of {pages}</span>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
              style={{ padding: '0.3rem 0.75rem', cursor: page === pages ? 'default' : 'pointer' }}>
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
