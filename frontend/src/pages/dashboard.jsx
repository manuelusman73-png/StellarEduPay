import { useState, useEffect, useCallback, useRef } from "react";
import SyncButton from "../components/SyncButton";
import ErrorBoundary from "../components/ErrorBoundary";
import { getSyncStatus, getPaymentSummary, getStudents } from "../services/api";

const PAGE_SIZE = 20;

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
  const [total, setTotal]               = useState(0);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [classFilter, setClassFilter]   = useState("");
  const [error, setError]               = useState(null);

  // Debounce search input so we don't fire a request on every keystroke.
  const searchDebounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchDebounceRef.current);
  }, [search]);

  const fetchSummary = useCallback(() => {
    setSummaryLoading(true);
    setSummaryError(null);
    getPaymentSummary()
      .then(({ data }) => setSummary(data))
      .catch(() => setSummaryError("Could not load payment summary."))
      .finally(() => setSummaryLoading(false));
  }, []);

  const fetchStudents = useCallback((p, srch, st, cls) => {
    setStudentsLoading(true);
    setStudentsError(null);
    getStudents(p, PAGE_SIZE, { search: srch, status: st, className: cls })
      .then(({ data }) => {
        setStudents(data.students);
        setPages(data.pages || 1);
        setTotal(data.total || 0);
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

  // Reset to page 1 whenever any filter changes, then fetch.
  useEffect(() => {
    setPage(1);
    fetchStudents(1, debouncedSearch, statusFilter, classFilter);
  }, [debouncedSearch, statusFilter, classFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch when page changes (filter-change above already resets to p=1).
  useEffect(() => {
    fetchStudents(page, debouncedSearch, statusFilter, classFilter);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSyncComplete(data) {
    setLastSyncAt(new Date().toISOString());
    setSyncMsg(data?.message || "Sync complete.");
    setTimeout(() => setSyncMsg(null), 3000);
    fetchSummary();
    setPage(1);
    fetchStudents(1, debouncedSearch, statusFilter, classFilter);
  }

  const stats = [
    { label: "Total Students",   value: summary?.totalStudents ?? summary?.total ?? "—" },
    { label: "Paid",             value: summary?.paidCount    ?? summary?.counts?.paid    ?? "—", accent: "#166534" },
    { label: "Pending",          value: (summary?.unpaidCount || 0) + (summary?.counts?.partial || 0) || "—", accent: "#854d0e" },
    { label: "XLM Collected",    value: summary ? `${(summary.totalXlmCollected || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—", sub: "XLM", accent: "#1d4ed8" },
  ];

  // Page-range display, e.g. "Showing 21–40 of 347 students"
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd   = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .dash-wrap { max-width: 1000px; margin: 0 auto; padding: 2rem 1rem; animation: fadeUp 0.4s ease both; overflow-x: hidden; box-sizing: border-box; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem 1.5rem; min-width: 0; overflow-wrap: break-word; min-height: 90px; }
        .stat-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 0.5rem; }
        .stat-value { font-size: 1.75rem; font-weight: 700; line-height: 1; }
        .stat-sub   { font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem; }
        .skeleton { height: 1.4rem; width: 55%; border-radius: 4px; background: linear-gradient(90deg, var(--border) 25%, rgba(200,200,200,0.3) 50%, var(--border) 75%); background-size: 400px 100%; animation: shimmer 1.5s infinite linear; }
        .skeleton-label { height: 0.75rem; width: 70%; border-radius: 4px; margin-bottom: 0.75rem; background: linear-gradient(90deg, var(--border) 25%, rgba(200,200,200,0.3) 50%, var(--border) 75%); background-size: 400px 100%; animation: shimmer 1.5s infinite linear; }
        .skeleton-value { height: 2rem; width: 50%; border-radius: 4px; background: linear-gradient(90deg, var(--border) 25%, rgba(200,200,200,0.3) 50%, var(--border) 75%); background-size: 400px 100%; animation: shimmer 1.5s infinite linear; }
        .dash-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .dash-table th { text-align: left; padding: 0.6rem 1rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
        .dash-table td { padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); }
        .dash-table tbody tr:last-child td { border-bottom: none; }
        .dash-table tbody tr:hover { background: rgba(126,200,227,0.06); }
        .status-badge { display: inline-block; padding: 0.2rem 0.65rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
        .toolbar { display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
        .toolbar input, .toolbar select { padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.9rem; background: var(--bg); color: var(--text); outline: none; min-width: 0; }
        .toolbar input { flex: 1; min-width: 140px; max-width: 320px; }
        .toolbar input:focus, .toolbar select:focus { border-color: var(--accent); }
        .page-btn { padding: 0.4rem 0.9rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); cursor: pointer; font-size: 0.85rem; }
        .page-btn:disabled { opacity: 0.4; cursor: default; }
        .table-wrap { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .pagination-bar { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-top: 1rem; font-size: 0.85rem; flex-wrap: wrap; }
        .pagination-controls { display: flex; align-items: center; gap: 0.5rem; }
      `}</style>

      {/* aria-live region for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>
        {summaryLoading || studentsLoading ? "Loading dashboard data..." : "Dashboard data loaded."}
      </div>
      {(summaryError || studentsError) && (
        <div aria-live="assertive" aria-atomic="true" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>
          {summaryError || studentsError}
        </div>
      )}

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
          <div role="status" style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 8, padding: "0.65rem 1rem", color: "#166534", fontSize: "0.875rem", margin: "1rem 0" }}>
            ✓ {syncMsg}
          </div>
        )}
        {error && (
          <div role="alert" style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.65rem 1rem", color: "#991b1b", fontSize: "0.875rem", margin: "1rem 0" }}>
            {error}
          </div>
        )}

        {/* Stats */}
        <ErrorBoundary>
          {summaryError ? (
            <div role="alert" style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.65rem 1rem", color: "#991b1b", fontSize: "0.875rem", margin: "1rem 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {summaryError}
              <button onClick={fetchSummary} style={{ marginLeft: "1rem", padding: "0.25rem 0.75rem", borderRadius: 6, border: "1px solid #fecaca", background: "transparent", color: "#991b1b", cursor: "pointer", fontSize: "0.8rem" }}>Retry</button>
            </div>
          ) : (
            <div className="stat-grid" style={{ marginTop: "1.5rem" }}>
              {summaryLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="stat-card" aria-hidden="true">
                      <div className="skeleton-label" />
                      <div className="skeleton-value" />
                    </div>
                  ))
                : stats.map(({ label, value, sub, accent }) => (
                    <div key={label} className="stat-card">
                      <div className="stat-label">{label}</div>
                      <div className="stat-value" style={accent ? { color: accent } : {}}>{value}</div>
                      {sub && <div className="stat-sub">{sub}</div>}
                    </div>
                  ))
              }
            </div>
          )}
        </ErrorBoundary>

        {/* Toolbar — search + filters (server-side) */}
        <div className="toolbar" role="search" aria-label="Filter students">
          <input
            type="search"
            placeholder="Search by name or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search students by name or ID"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filter by payment status"
          >
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            aria-label="Filter by class"
          >
            <option value="">All Classes</option>
            <option value="JSS1">JSS1</option>
            <option value="JSS2">JSS2</option>
            <option value="JSS3">JSS3</option>
            <option value="SS1">SS1</option>
            <option value="SS2">SS2</option>
            <option value="SS3">SS3</option>
          </select>
        </div>

        {/* Table */}
        <ErrorBoundary>
          {studentsError ? (
            <div role="alert" style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.65rem 1rem", color: "#991b1b", fontSize: "0.875rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {studentsError}
              <button
                onClick={() => fetchStudents(page, debouncedSearch, statusFilter, classFilter)}
                style={{ marginLeft: "1rem", padding: "0.25rem 0.75rem", borderRadius: 6, border: "1px solid #fecaca", background: "transparent", color: "#991b1b", cursor: "pointer", fontSize: "0.8rem" }}
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="table-wrap" aria-busy={studentsLoading} aria-label="Student list">
              {studentsLoading ? (
                <table className="dash-table" aria-label="Loading students">
                  <thead>
                    <tr>
                      <th>Student ID</th><th>Name</th><th>Class</th><th>Fee</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td><div className="skeleton" style={{ width: "70px" }} /></td>
                        <td><div className="skeleton" style={{ width: "120px" }} /></td>
                        <td><div className="skeleton" style={{ width: "80px" }} /></td>
                        <td><div className="skeleton" style={{ width: "60px" }} /></td>
                        <td><div className="skeleton" style={{ width: "55px" }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th scope="col">Student ID</th>
                      <th scope="col">Name</th>
                      <th scope="col">Class</th>
                      <th scope="col">Fee</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: "center", padding: "2.5rem", color: "var(--muted)" }}>
                          No students found.
                        </td>
                      </tr>
                    ) : students.map(s => {
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

        {/* Pagination — always visible when there are students */}
        {total > 0 && (
          <div className="pagination-bar">
            {/* Page-range summary */}
            <span style={{ color: "var(--muted)" }} aria-live="polite" aria-atomic="true">
              {studentsLoading
                ? "Loading…"
                : `Showing ${rangeStart}–${rangeEnd} of ${total.toLocaleString()} students`}
            </span>

            {/* Previous / Next controls */}
            <nav className="pagination-controls" aria-label="Student list pagination">
              <button
                className="page-btn"
                disabled={page === 1 || studentsLoading}
                onClick={() => setPage(p => p - 1)}
                aria-label="Go to previous page"
              >
                ← Prev
              </button>
              <span style={{ color: "var(--muted)" }} aria-current="page">
                Page {page} of {pages}
              </span>
              <button
                className="page-btn"
                disabled={page === pages || studentsLoading}
                onClick={() => setPage(p => p + 1)}
                aria-label="Go to next page"
              >
                Next →
              </button>
            </nav>
          </div>
        )}
      </div>
    </>
  );
}
