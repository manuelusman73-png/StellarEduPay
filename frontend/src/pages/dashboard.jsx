import { useState, useEffect, useCallback, useMemo } from "react";
import SyncButton from "../components/SyncButton";
import { getSyncStatus, getPaymentSummary, getStudents, registerStudent } from "../services/api";

const PAGE_SIZE = 10;

function timeAgo(isoString) {
  if (!isoString) return "Never";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  return new Date(isoString).toLocaleString();
}

export default function Dashboard() {
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [syncMessage, setSyncMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    studentId: "",
    name: "",
    class: "",
    feeAmount: "",
  });
  const [formError, setFormError] = useState(null);

  // Search & filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchStudents = useCallback(
    (p = page) => {
      setLoading(true);
      setError(null);
      return getStudents(p, PAGE_SIZE)
        .then(({ data }) => {
          setLastSyncAt(data.lastSyncAt);
          setError(null);
        })
        .catch((err) => {
          setError("Failed to load sync status. Please try again.");
          console.error(err);
        })
        .finally(() => setLoading(false));
    },
    [page],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSummary = useCallback(() => {
    setSummaryLoading(true);
    return getPaymentSummary()
      .then(({ data }) => setSummary(data))
      .catch(() => { })
      .finally(() => setSummaryLoading(false));
  }, []);

  const fetchSyncStatus = useCallback(() => {
    setLoading(true);
    return getSyncStatus()
      .then(({ data }) => {
        setLastSyncAt(data.lastSyncAt);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Initial load
  useEffect(() => {
    fetchSyncStatus();
    fetchSummary();
    fetchStudents(1);
  }, [fetchSyncStatus, fetchSummary, fetchStudents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (students || []).filter((s) => {
      const matchesSearch =
        !q ||
        (s.name || "").toLowerCase().includes(q) ||
        (s.studentId || s.student_id || "").toLowerCase().includes(q);

      const status = (s.status || "unpaid").toLowerCase();
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "paid" && status === "paid") ||
        (statusFilter === "unpaid" && status === "unpaid") ||
        (statusFilter === "partial" && status === "partial");

      return matchesSearch && matchesStatus;
    });
  }, [students, search, statusFilter]);

  async function handleRegister(e) {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    try {
      await registerStudent(formData);
      setSyncMessage("Student registered successfully!");
      setShowForm(false);
      setFormData({ studentId: "", name: "", class: "", feeAmount: "" });
      fetchSummary();
      fetchStudents(1);
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err) {
      setFormError(err.response?.data?.error || "Registration failed. Please check inputs.");
    } finally {
      setFormLoading(false);
    }
  }

  function handleExportCSV() {
    if (filtered.length === 0) return;
    
    const headers = ["Student ID", "Name", "Class", "Fee Amount", "Status", "Tx Hash", "Payment Date"];
    const rows = filtered.map(s => [
      `"${s.studentId}"`,
      `"${s.name}"`,
      `"${s.class}"`,
      s.feeAmount,
      s.status || "Unpaid",
      `"${s.lastPaymentHash || ''}"`,
      s.lastPaymentAt ? new Date(s.lastPaymentAt).toLocaleDateString() : ""
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().split('T')[0];
    
    link.setAttribute("href", url);
    link.setAttribute("download", `stellaredupay-${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleSyncComplete(data) {
    setLastSyncAt(new Date().toISOString());
    setSyncMessage(data?.message || "Sync complete.");
    setTimeout(() => setSyncMessage(null), 3000);
    fetchSummary();
    fetchStudents(1);
  }

  const cards = [
    { label: "Total Students", value: summary?.totalStudents || summary?.total, cls: "" },
    { label: "Full Paid", value: summary?.paidCount || summary?.counts?.paid, cls: "paid" },
    { label: "Pending/Partial", value: (summary?.unpaidCount || 0) + (summary?.counts?.partial || 0), cls: "unpaid" },
    {
      label: "XLM Collected",
      value: summary
        ? `${(summary.totalXlmCollected || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 })} XLM`
        : null,
      cls: "xlm",
    },
  ];

  // Build category cards from summary data
  const categoryCards = summary?.categoryBreakdown
    ? summary.categoryBreakdown.map(cat => ({
      label: cat.category,
      value: `${cat.totalCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 })} XLM`,
      count: cat.paymentCount,
      cls: "category",
    }))
    : [];

  return (
    <>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .summary-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .summary-card .label { font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
        .summary-card .value { font-size: 1.75rem; font-weight: 800; color: #0f172a; line-height: 1.2; }
        .summary-card.paid .value { color: #10b981; }
        .summary-card.unpaid .value { color: #f59e0b; }
        .summary-card.xlm .value { color: #3b82f6; }
        .summary-skeleton { height: 1.75rem; width: 60%; background: #f1f5f9; border-radius: 6px; animation: pulse 1.5s infinite; }
        
        .student-table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .student-table th { background: #f8fafc; text-align: left; padding: 1rem; font-size: 0.85rem; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0; }
        .student-table td { padding: 1rem; font-size: 0.9rem; border-bottom: 1px solid #f1f5f9; }
        .student-table tr:last-child td { border-bottom: none; }
        .badge { display: inline-block; padding: 0.25rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
        .badge.paid { background: #d1fae5; color: #065f46; }
        .badge.unpaid { background: #fee2e2; color: #991b1b; }
        .badge.partial { background: #fef3c7; color: #92400e; }

        .form-overlay { padding: 2rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; margin-bottom: 2rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; }
        .form-group label { display: block; font-size: 0.85rem; color: #475569; font-weight: 500; margin-bottom: 0.5rem; }
        .form-control { width: 100%; padding: 0.65rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.9rem; transition: border 0.2s; }
        .form-control:focus { outline: none; border-color: #3b82f6; ring: 2px solid #3b82f622; }
        .btn-primary { background: #3b82f6; color: #fff; padding: 0.65rem 1.25rem; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-ghost { background: transparent; color: #64748b; padding: 0.65rem 1.25rem; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; }
        .btn-success { background: #10b981; color: #fff; padding: 0.65rem 1.25rem; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
        .btn-success:hover { opacity: 0.9; }
      `}</style>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.5rem",
          }}
        >
          <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
          <SyncButton onSyncComplete={handleSyncComplete} lastSyncTime={lastSyncAt} />
        </div>

        {/* Sync status alert */}
        {syncMessage && (
          <div style={{ background: "#ecfdf5", border: "1px solid #10b98122", padding: "0.75rem 1.25rem", borderRadius: 8, color: "#065f46", marginBottom: "1.5rem", fontSize: "0.95rem", fontWeight: 500 }}>
            ✓ {syncMessage}
          </div>
        )}

        {/* Sync status */}
        {loading ? (
          <p style={{ fontSize: "0.85rem", color: "#888" }}>Loading sync status…</p>
        ) : error ? (
          <div
            style={{
              padding: "1rem",
              background: "#ffebee",
              borderRadius: 6,
              border: "1px solid #ef5350",
              marginBottom: "1rem",
            }}
          >
            <p style={{ color: "#c62828", margin: "0 0 0.75rem 0" }} role="alert">
              {error}
            </p>
            <button
              onClick={handleRetry}
              style={{
                padding: "0.5rem 1rem",
                background: "#ef5350",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Sync Status Info */}
        {!loading && (
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "1.5rem" }}>
            Last data refresh: <strong>{timeAgo(lastSyncAt)}</strong>
          </p>
        )}

        {/* Summary cards */}
        <div className="summary-cards">
          {cards.map(({ label, value, cls }) => (
            <div key={label} className={`summary-card ${cls}`}>
              <div className="label">{label}</div>
              {summaryLoading || value == null ? (
                <div className="summary-skeleton" />
              ) : (
                <div className="value">{value}</div>
              )}
            </div>
          ))}
        </div>

        {/* Filters and Search */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
          <input 
            placeholder="Search students..."
            className="form-control"
            style={{ maxWidth: "340px" }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select 
            className="form-control" 
            style={{ maxWidth: "180px" }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>

        {/* Student Table */}
        {studentsLoading ? (
          <p>Loading students...</p>
        ) : (
          <>
            <table className="student-table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Total Fee</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.studentId}>
                    <td>{s.studentId}</td>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td>{s.class}</td>
                    <td>{s.feeAmount} XLM</td>
                    <td>
                      <span className={`badge ${s.status?.toLowerCase() || 'unpaid'}`}>
                        {s.status || 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
                      No students found matching filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {pages > 1 && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <button 
                  disabled={page === 1} 
                  onClick={() => setPage(page - 1)}
                  style={{ ...pageBtnStyle, opacity: page === 1 ? 0.5 : 1 }}
                >
                  Prev
                </button>
                <div style={{ display: "flex", alignItems: "center", padding: "0 1rem", fontSize: "0.9rem" }}>
                  Page {page} of {pages}
                </div>
                <button 
                  disabled={page === pages} 
                  onClick={() => setPage(page + 1)}
                  style={{ ...pageBtnStyle, opacity: page === pages ? 0.5 : 1 }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

const pageBtnStyle = {
  padding: "0.4rem 0.9rem",
  fontSize: "0.88rem",
  background: "#1a1a2e",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};
