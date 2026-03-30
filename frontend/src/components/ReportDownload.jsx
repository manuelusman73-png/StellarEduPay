import { useState } from "react";
import { getReport, getReportCsvUrl } from "../services/api";

export default function ReportDownload() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGenerate(e) {
    e.preventDefault();
    setError("");
    setReport(null);
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const { data } = await getReport(params);
      setReport(data);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to generate report.");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadCsv() {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    window.open(getReportCsvUrl(params), "_blank");
  }

  return (
    <div style={{ maxWidth: 700, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h2>Payment Reports</h2>

      <form
        onSubmit={handleGenerate}
        style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}
      >
        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.85rem" }}>
          Start Date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: "0.4rem", marginTop: "0.25rem" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.85rem" }}>
          End Date
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: "0.4rem", marginTop: "0.25rem" }}
          />
        </label>
        <button type="submit" disabled={loading} style={{ padding: "0.5rem 1.25rem" }}>
          {loading ? "Loading..." : "Generate Report"}
        </button>
      </form>

      {error && <p style={{ color: "red", marginTop: "0.75rem" }}>{error}</p>}

      {report && (
        <div style={{ marginTop: "1.5rem" }}>
          {/* Summary */}
          <div
            style={{
              background: "#f5f5f5",
              padding: "1rem",
              borderRadius: 8,
              marginBottom: "1rem",
            }}
          >
            <p style={{ margin: "0 0 0.5rem", fontWeight: "bold" }}>Summary</p>
            <p style={{ margin: "0.2rem 0" }}>
              Generated: {new Date(report.generatedAt).toLocaleString()}
            </p>
            <p style={{ margin: "0.2rem 0" }}>
              Period: {report.period.startDate || "all time"} →{" "}
              {report.period.endDate || "all time"}
            </p>
            <hr style={{ margin: "0.75rem 0" }} />
            <p style={{ margin: "0.2rem 0" }}>
              Total Collected: <strong>{report.summary.totalAmount} XLM/USDC</strong>
            </p>
            <p style={{ margin: "0.2rem 0" }}>Total Payments: {report.summary.paymentCount}</p>
            <p style={{ margin: "0.2rem 0" }}>
              Valid: {report.summary.validCount} | Overpaid: {report.summary.overpaidCount} |
              Underpaid: {report.summary.underpaidCount}
            </p>
            <p style={{ margin: "0.2rem 0" }}>
              Fully Paid Students: {report.summary.fullyPaidStudentCount}
            </p>
          </div>

          {/* Daily breakdown table */}
          {report.byDate.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "#e0e0e0" }}>
                  {[
                    "Date",
                    "Total Amount",
                    "Payments",
                    "Valid",
                    "Overpaid",
                    "Underpaid",
                    "Students",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{ padding: "0.5rem", textAlign: "left", border: "1px solid #ccc" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.byDate.map((row) => (
                  <tr key={row.date}>
                    <td style={cell}>{row.date}</td>
                    <td style={cell}>{row.totalAmount}</td>
                    <td style={cell}>{row.paymentCount}</td>
                    <td style={cell}>{row.validCount}</td>
                    <td style={cell}>{row.overpaidCount}</td>
                    <td style={cell}>{row.underpaidCount}</td>
                    <td style={cell}>{row.uniqueStudentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "#888" }}>No payments found for this period.</p>
          )}

          {/* Download button */}
          <button
            onClick={handleDownloadCsv}
            style={{ marginTop: "1rem", padding: "0.5rem 1.25rem", cursor: "pointer" }}
          >
            Download CSV
          </button>
        </div>
      )}
    </div>
  );
}

const cell = { padding: "0.4rem 0.5rem", border: "1px solid #ccc" };
