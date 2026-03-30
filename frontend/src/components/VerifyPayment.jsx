import { useState, useRef } from "react";
import { verifyPayment } from "../services/api";

export default function VerifyPayment() {
  const [txHash, setTxHash] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const errorRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await verifyPayment(txHash.trim());
      setResult(res.data);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Verification failed. Please check the transaction hash and try again.";
      setError(msg);
      errorRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  const statusColor = {
    valid: "#2e7d32",
    overpaid: "#e65100",
    underpaid: "#c62828",
    unknown: "#555",
  };

  return (
    <div style={{ maxWidth: 480, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h2>Verify Payment</h2>
      <p style={{ color: "#555", marginTop: 0 }}>
        Enter your Stellar transaction hash to confirm your payment was recorded.
      </p>

      <form onSubmit={handleSubmit}>
        <label
          htmlFor="txHashInput"
          style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}
        >
          Transaction Hash
        </label>
        <input
          id="txHashInput"
          type="text"
          placeholder="e.g. 3389e9f0f1a65f19..."
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          required
          aria-required="true"
          aria-describedby={error ? "verifyError" : undefined}
          style={{
            width: "100%",
            padding: "0.5rem",
            marginBottom: "0.5rem",
            boxSizing: "border-box",
            fontFamily: "monospace",
          }}
        />
        <button
          type="submit"
          disabled={loading || !txHash.trim()}
          style={{ padding: "0.5rem 1rem" }}
        >
          {loading ? "Verifying..." : "Verify Transaction"}
        </button>
      </form>

      {error && (
        <p
          id="verifyError"
          ref={errorRef}
          role="alert"
          tabIndex="-1"
          style={{ color: "#c62828", marginTop: "0.75rem" }}
        >
          {error}
        </p>
      )}

      {result && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: "1.5rem",
            background: "#f5f5f5",
            padding: "1rem",
            borderRadius: 8,
            borderLeft: "4px solid #2e7d32",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontWeight: 600, color: "#2e7d32" }}>
            ✅ Transaction found
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <tbody>
              <tr>
                <td style={labelCell}>Amount</td>
                <td style={valueCell}>
                  {result.amount} {result.assetCode || "XLM"}
                </td>
              </tr>
              <tr>
                <td style={labelCell}>Student ID (memo)</td>
                <td style={{ ...valueCell, fontFamily: "monospace" }}>{result.memo}</td>
              </tr>
              <tr>
                <td style={labelCell}>Date</td>
                <td style={valueCell}>
                  {result.date ? new Date(result.date).toLocaleString() : "—"}
                </td>
              </tr>
              {result.feeValidation && (
                <tr>
                  <td style={labelCell}>Fee status</td>
                  <td
                    style={{
                      ...valueCell,
                      fontWeight: 600,
                      color: statusColor[result.feeValidation.status] || "#555",
                    }}
                  >
                    {result.feeValidation.status} — {result.feeValidation.message}
                  </td>
                </tr>
              )}
              {result.networkFee != null && (
                <tr>
                  <td style={labelCell}>Network fee</td>
                  <td style={valueCell}>{result.networkFee} XLM</td>
                </tr>
              )}
              <tr>
                <td style={labelCell}>Transaction hash</td>
                <td
                  style={{
                    ...valueCell,
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                    fontSize: "0.8rem",
                  }}
                >
                  {result.hash}
                  {result.stellarExplorerUrl && (
                    <a
                      href={result.stellarExplorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-block",
                        marginLeft: "0.5rem",
                        fontFamily: "sans-serif",
                      }}
                    >
                      View on Explorer
                    </a>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const labelCell = {
  padding: "0.35rem 0.5rem 0.35rem 0",
  color: "#555",
  verticalAlign: "top",
  whiteSpace: "nowrap",
  width: "40%",
};

const valueCell = {
  padding: "0.35rem 0",
  verticalAlign: "top",
};
