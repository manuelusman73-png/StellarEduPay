import { useState, useEffect } from "react";
import { getRecentAuditLogs } from "../services/api";

function formatTimestamp(isoString) {
  if (!isoString) return "N/A";
  const date = new Date(isoString);
  return date.toLocaleString();
}

function getActionLabel(action) {
  const labels = {
    student_create: "Student Created",
    student_update: "Student Updated",
    student_delete: "Student Deleted",
    student_bulk_import: "Bulk Import",
    payment_manual_sync: "Manual Sync",
    payment_finalize: "Payment Finalized",
    fee_create: "Fee Created",
    fee_update: "Fee Updated",
    fee_delete: "Fee Deleted",
    school_create: "School Created",
    school_update: "School Updated",
    school_deactivate: "School Deactivated",
  };
  return labels[action] || action;
}

export default function AuditLog({ limit = 10 }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getRecentAuditLogs(limit)
      .then(({ data }) => setLogs(data))
      .catch((err) => {
        setError("Failed to load audit logs");
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [limit]);

  if (loading) {
    return (
      <div style={containerStyle}>
        <h2 style={titleStyle}>Recent Admin Actions</h2>
        <p style={{ color: "#888", fontSize: "0.9rem" }}>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <h2 style={titleStyle}>Recent Admin Actions</h2>
        <p style={{ color: "#c62828", fontSize: "0.9rem" }}>{error}</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div style={containerStyle}>
        <h2 style={titleStyle}>Recent Admin Actions</h2>
        <p style={{ color: "#888", fontSize: "0.9rem" }}>No audit logs yet</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>Recent Admin Actions</h2>
      <div style={tableContainerStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Action</th>
              <th style={thStyle}>Performed By</th>
              <th style={thStyle}>Target</th>
              <th style={thStyle}>Result</th>
              <th style={thStyle}>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log._id} style={trStyle}>
                <td style={tdStyle}>{getActionLabel(log.action)}</td>
                <td style={tdStyle}>{log.performedBy}</td>
                <td style={tdStyle}>
                  <span style={targetBadgeStyle}>{log.targetType}</span>
                  {" "}
                  {log.targetId}
                </td>
                <td style={tdStyle}>
                  <span
                    style={{
                      ...resultBadgeStyle,
                      background: log.result === "success" ? "#e8f5e9" : "#ffebee",
                      color: log.result === "success" ? "#2e7d32" : "#c62828",
                    }}
                  >
                    {log.result}
                  </span>
                </td>
                <td style={tdStyle}>{formatTimestamp(log.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const containerStyle = {
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 10,
  padding: "1.5rem",
  marginTop: "2rem",
};

const titleStyle = {
  fontSize: "1.25rem",
  fontWeight: 600,
  marginBottom: "1rem",
  color: "#1a1a1a",
};

const tableContainerStyle = {
  overflowX: "auto",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.9rem",
};

const thStyle = {
  textAlign: "left",
  padding: "0.75rem",
  borderBottom: "2px solid #e0e0e0",
  color: "#666",
  fontWeight: 600,
  fontSize: "0.85rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle = {
  padding: "0.75rem",
  borderBottom: "1px solid #f0f0f0",
  color: "#333",
};

const trStyle = {
  transition: "background 0.2s",
};

const targetBadgeStyle = {
  display: "inline-block",
  padding: "0.2rem 0.5rem",
  background: "#e3f2fd",
  color: "#1565c0",
  borderRadius: 4,
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase",
};

const resultBadgeStyle = {
  display: "inline-block",
  padding: "0.2rem 0.6rem",
  borderRadius: 4,
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "capitalize",
};
