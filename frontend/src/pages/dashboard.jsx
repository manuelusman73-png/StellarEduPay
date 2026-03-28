import { useState, useEffect, useMemo } from "react";
import Navbar from "../components/Navbar";
import SyncButton from "../components/SyncButton";
import { getSyncStatus, getStudents } from "../services/api";

const PAGE_SIZE = 50;

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

function SkeletonRow() {
  return (
    <tr>
      {[1, 2, 3, 4].map((i) => (
        <td key={i} style={{ padding: "0.6rem 0.75rem" }}>
          <div
            style={{
              height: "0.85rem",
              background: "#e0e0e0",
              borderRadius: 4,
              animation: "pulse 1.5s infinite",
            }}
          />
        </td>
      ))}
    </tr>
  );
}

export default function Dashboard() {
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [syncMessage, setSyncMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  // Search & filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    getSyncStatus()
      .then(({ data }) => {
        setLastSyncAt(data.lastSyncAt);
        setError(null);
      })
      .catch(() => setError("Failed to load sync status. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setStudentsLoading(true);
    getStudents(page, PAGE_SIZE)
      .then(({ data }) => {
        setStudents(data.students || []);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
      })
      .catch(() => {})
      .finally(() => setStudentsLoading(false));
  }, [page]);

  // Client-side filtering
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      const matchesSearch =
        !q ||
        (s.name || "").toLowerCase().includes(q) ||
        (s.studentId || s.student_id || "").toLowerCase().includes(q);

      const paid = s.hasPaid ?? s.has_paid ?? false;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "paid" && paid) ||
        (statusFilter === "unpaid" && !paid);

      return matchesSearch && matchesStatus;
    });
  }, [students, search, statusFilter]);

  function handleSyncComplete(data) {
    setLastSyncAt(new Date().toISOString());
    setSyncMessage(data?.message || "Sync complete.");
    setTimeout(() => setSyncMessage(null), 3000);
  }

  function handleRetry() {
    setLoading(true);
    setError(null);
    getSyncStatus()
      .then(({ data }) => {
        setLastSyncAt(data.lastSyncAt);
        setError(null);
      })
      .catch(() => setError("Failed to load sync status. Please try again."))
      .finally(() => setLoading(false));
  }

  return (
    <>
      <Navbar />
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .student-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .student-table th, .student-table td { padding: 0.6rem 0.75rem; text-align: left; border-bottom: 1px solid #eee; }
        .student-table th { background: #f5f5f5; font-weight: 600; color: #444; }
        .student-table tr:hover td { background: #fafafa; }
        .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.78rem; font-weight: 500; }
        .badge-paid { background: #e8f5e9; color: #2e7d32; }
        .badge-unpaid { background: #fff3e0; color: #e65100; }
        .filter-bar { display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: center; }
        .search-input { flex: 1; min-width: 200px; padding: 0.45rem 0.75rem; border: 1px solid #ccc; border-radius: 6px; font-size: 0.9rem; }
        .search-input:focus { outline: none; border-color: #1a73e8; box-shadow: 0 0 0 2px rgba(26,115,232,0.15); }
        .status-select { padding: 0.45rem 0.75rem; border: 1px solid #ccc; border-radius: 6px; font-size: 0.9rem; background: white; cursor: pointer; }
        .status-select:focus { outline: none; border-color: #1a73e8; }
        .result-count { font-size: 0.82rem; color: #888; margin-left: auto; white-space: nowrap; }
      `}</style>

      <div
        style={{
          maxWidth: 960,
          margin: "2rem auto",
          fontFamily: "sans-serif",
          padding: "0 1rem",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.5rem",
          }}
        >
          <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
          <SyncButton
            onSyncComplete={handleSyncComplete}
            lastSyncTime={lastSyncAt}
          />
        </div>

        {syncMessage && (
          <p
            style={{
              color: "#2e7d32",
              background: "#f1f8e9",
              padding: "0.6rem 1rem",
              borderRadius: 6,
              fontSize: "0.9rem",
            }}
            role="status"
          >
            ✓ {syncMessage}
          </p>
        )}

        {/* Sync status */}
        {loading ? (
          <p style={{ fontSize: "0.85rem", color: "#888" }}>
            Loading sync status…
          </p>
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
            <p
              style={{ color: "#c62828", margin: "0 0 0.75rem 0" }}
              role="alert"
            >
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
        ) : (
          <p
            style={{
              fontSize: "0.85rem",
              color: "#888",
              marginBottom: "1.5rem",
            }}
          >
            Last synced: <strong>{timeAgo(lastSyncAt)}</strong>
          </p>
        )}

        {/* Student table section */}
        <h2
          style={{ fontSize: "1.1rem", marginBottom: "0.75rem", color: "#333" }}
        >
          Students
        </h2>

        {/* Filter bar */}
        <div className="filter-bar">
          <input
            className="search-input"
            type="search"
            placeholder="Search by name or student ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search students by name or ID"
          />
          <select
            className="status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by payment status"
          >
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
          {!studentsLoading && (
            <span className="result-count">
              {filtered.length} of {students.length} student
              {students.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Table */}
        <div
          style={{
            overflowX: "auto",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
          }}
        >
          <table className="student-table" aria-label="Student list">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Class</th>
                <th>Payment Status</th>
              </tr>
            </thead>
            <tbody>
              {studentsLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      textAlign: "center",
                      color: "#999",
                      padding: "2rem",
                    }}
                  >
                    {students.length === 0
                      ? "No students found."
                      : "No students match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const paid = s.hasPaid ?? s.has_paid ?? false;
                  return (
                    <tr key={s.studentId || s.student_id || s.id}>
                      <td>
                        <code style={{ fontSize: "0.82rem" }}>
                          {s.studentId || s.student_id}
                        </code>
                      </td>
                      <td>{s.name || "—"}</td>
                      <td>{s.class || s.className || "—"}</td>
                      <td>
                        <span
                          className={`badge ${paid ? "badge-paid" : "badge-unpaid"}`}
                        >
                          {paid ? "Paid" : "Unpaid"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!studentsLoading && pages > 1 && (
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "center",
              marginTop: "1rem",
              alignItems: "center",
            }}
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: 4,
                border: "1px solid #ccc",
                cursor: page === 1 ? "default" : "pointer",
                background: page === 1 ? "#f5f5f5" : "white",
              }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: "0.85rem", color: "#666" }}>
              Page {page} of {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: 4,
                border: "1px solid #ccc",
                cursor: page === pages ? "default" : "pointer",
                background: page === pages ? "#f5f5f5" : "white",
              }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
