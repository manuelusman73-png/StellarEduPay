import { useState, useEffect, useCallback } from "react";
import SyncButton from "../components/SyncButton";
import ErrorBoundary from "../components/ErrorBoundary";
import { getSyncStatus, getPaymentSummary, getStudents } from "../services/api";

const PAGE_SIZE = 10;

function timeAgo(iso) {
  if (!iso) return "Never";
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_COLOR = {
  paid:    { bg: "#dcfce7", color: "#166534" },
  partial: { bg: "#fef9c3", color: "#854d0e" },
  unpaid:  { bg: "#fee2e2", color: "#991b1b" },
};

export default function Dashboard() {
  const [lastSyncAt, setLastSyncAt]     = useState(null);
  const [syncMsg, setSyncMsg]           = useState(null);
  const [summary, setSummary]           = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError]     = useState(null);
  const [students, setStudents]         = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError]   = useState(null);
  const [page, setPage]                 = useState(1);
  const [pages, setPages]               = useState(1);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError]               = useState(null);

  const fetchSummary = useCallback(() => {
    setSummaryLoading(true);
    setSummaryError(null);
    getPaymentSummary()
      .then(({ data }) => setSummary(data))
      .catch(() => setSummaryError("Could not load payment summary."))
      .finally(() => setSummaryLoading(false));
  }, []);

  const fetchStudents = useCallback((p) => {
    setStudentsLoading(true);
    setStudentsError(null);
    getStudents(p, PAGE_SIZE)
      .then(({ data }) => {
        setStudents(data.students);
        setPages(data.pages || 1);
      })
      .catch(() => setStudentsError("Could not load student list."))
      .finally(() => setStudentsLoading(false));
  }, []);

  useEffect(() => {
    getSyncStatus()
      .then(({ data }) => setLastSyncAt(data.lastSyncAt))
      .catch(() => setError("Could not load sync status."));
    fetchSummary();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchStudents(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSyncComplete(data) {
    setLastSyncAt(new Date().toISOString());
    setSyncMsg(data?.message || "Sync complete.");
    setTimeout(() => setSyncMsg(null), 3000);
    fetchSummary();
    fetchStudents(1);
  }

  const stats = [
    { label: "Total Students",   value: summary?.totalStudents ?? summary?.total ?? "—" },
    { label: "Paid",             value: summary?.paidCount    ?? summary?.counts?.paid    ?? "—", accent: "#166534" },
    { label: "Pending",          value: (summary?.unpaidCount || 0) + (summary?.counts?.partial || 0) || "—", accent: "#854d0e" },
    { label: "XLM Collected",    value: summary ? `${(summary.totalXlmCollected || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—", sub: "XLM", accent: "#1d4ed8" },
  ];

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const matchQ = !q || s.name?.toLowerCase().includes(q) || s.studentId?.toLowerCase().includes(q);
    const matchS = statusFilter === "all" || (s.status || "unpaid").toLowerCase() === statusFilter;
    return matchQ && matchS;
  });

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .dash-wrap { max-width: 1000px; margin: 0 auto; padding: 2rem 1rem; animation: fadeUp 0.4s ease both; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem 1.5rem; }
        .stat-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 0.5rem; }
        .stat-value { font-size: 1.75rem; font-weight: 700; line-height: 1; }
        .stat-sub   { font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem; }
        .dash-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .dash-table th { text-align: left; padding: 0.6rem 1rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); border-bottom: 1px solid var(--border); }
        .dash-table td { padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); }
        .dash-table tbody tr:last-child td { border-bottom: none; }
        .dash-table tbody tr:hover { background: rgba(126,200,227,0.06); }
        .status-badge { display: inline-block; padding: 0.2rem 0.65rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
        .toolbar { display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
        .toolbar input, .toolbar select { padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.9rem; background: var(--bg); color: var(--text); outline: none; }
        .toolbar input { flex: 1; min-width: 180px; max-width: 320px; }
        .toolbar input:focus, .toolbar select:focus { border-color: var(--accent); }
        .page-btn { padding: 0.4rem 0.9rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); cursor: pointer; font-size: 0.85rem; }
        .page-btn:disabled { opacity: 0.4; cursor: default; }
        .skeleton { height: 1.4rem; width: 55%; background: var(--border); border-radius: 4px; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .table-wrap { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
      `}</style>

      <div className="dash-wrap">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Dashboard</h1>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
              Last sync: <strong>{timeAgo(lastSyncAt)}</strong>
            </p>
          </div>
          <SyncButton onSyncComplete={handleSyncComplete} lastSyncTime={lastSyncAt} />
        </div>

        {/* Alerts */}
        {syncMsg && (
          <div style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 8, padding: "0.65rem 1rem", color: "#166534", fontSize: "0.875rem", margin: "1rem 0" }}>
            ✓ {syncMsg}
          </div>
        )}
        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.65rem 1rem", color: "#991b1b", fontSize: "0.875rem", margin: "1rem 0" }}>
            {error}
          </div>
        )}

        {/* Stats */}
        <ErrorBoundary>
          {summaryError ? (
            <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.65rem 1rem", color: "#991b1b", fontSize: "0.875rem", margin: "1rem 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {summaryError}
              <button onClick={fetchSummary} style={{ marginLeft: "1rem", padding: "0.25rem 0.75rem", borderRadius: 6, border: "1px solid #fecaca", background: "transparent", color: "#991b1b", cursor: "pointer", fontSize: "0.8rem" }}>Retry</button>
            </div>
          ) : (
            <div className="stat-grid" style={{ marginTop: "1.5rem" }}>
              {stats.map(({ label, value, sub, accent }) => (
                <div key={label} className="stat-card">
                  <div className="stat-label">{label}</div>
                  {summaryLoading ? <div className="skeleton" /> : (
                    <>
                      <div className="stat-value" style={accent ? { color: accent } : {}}>{value}</div>
                      {sub && <div className="stat-sub">{sub}</div>}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </ErrorBoundary>

        {/* Toolbar */}
        <div className="toolbar">
          <input
            placeholder="Search by name or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>

        {/* Table */}
        <ErrorBoundary>
          {studentsError ? (
            <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.65rem 1rem", color: "#991b1b", fontSize: "0.875rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {studentsError}
              <button onClick={() => fetchStudents(page)} style={{ marginLeft: "1rem", padding: "0.25rem 0.75rem", borderRadius: 6, border: "1px solid #fecaca", background: "transparent", color: "#991b1b", cursor: "pointer", fontSize: "0.8rem" }}>Retry</button>
            </div>
          ) : (
            <div className="table-wrap">
              {studentsLoading ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)", fontSize: "0.9rem" }}>Loading…</div>
              ) : (
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Class</th>
                      <th>Fee</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan="5" style={{ textAlign: "center", padding: "2.5rem", color: "var(--muted)" }}>No students found.</td></tr>
                    ) : filtered.map(s => {
                      const st = (s.status || "unpaid").toLowerCase();
                      const badge = STATUS_COLOR[st] || STATUS_COLOR.unpaid;
                      return (
                        <tr key={s.studentId}>
                          <td style={{ color: "var(--muted)", fontFamily: "monospace" }}>{s.studentId}</td>
                          <td style={{ fontWeight: 500 }}>{s.name}</td>
                          <td>{s.class}</td>
                          <td>{s.feeAmount} XLM</td>
                          <td>
                            <span className="status-badge" style={badge}>{st}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </ErrorBoundary>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem", marginTop: "1rem", fontSize: "0.85rem" }}>
            <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span style={{ color: "var(--muted)" }}>Page {page} of {pages}</span>
            <button className="page-btn" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </>
  );
}
