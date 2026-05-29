import { FixedSizeList } from "react-window";

const VIRTUALIZE_THRESHOLD = 100;
const ROW_HEIGHT = 52;
const LIST_HEIGHT = 480;

const STATUS_COLOR = {
  valid:    { bg: "#dcfce7", color: "#166534" },
  overpaid: { bg: "#fef9c3", color: "#854d0e" },
  underpaid:{ bg: "#fee2e2", color: "#991b1b" },
  unknown:  { bg: "#f3f4f6", color: "#374151" },
};

const COLUMNS = [
  { key: "txHash",              label: "Tx Hash",   width: "22%" },
  { key: "amount",              label: "Amount",    width: "14%" },
  { key: "feeAmount",           label: "Fee",       width: "14%" },
  { key: "feeValidationStatus", label: "Status",    width: "14%" },
  { key: "memo",                label: "Memo",      width: "14%" },
  { key: "confirmedAt",         label: "Confirmed", width: "22%" },
];

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function truncate(str, n = 12) {
  if (!str) return "—";
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

function StatusBadge({ status }) {
  const s = (status || "unknown").toLowerCase();
  const style = STATUS_COLOR[s] || STATUS_COLOR.unknown;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.2rem 0.6rem",
        borderRadius: 20,
        fontSize: "0.75rem",
        fontWeight: 600,
        textTransform: "capitalize",
        ...style,
      }}
    >
      {s}
    </span>
  );
}

function Row({ index, style, data }) {
  const row = data[index];
  const isEven = index % 2 === 0;
  return (
    <div
      role="row"
      aria-rowindex={index + 2} /* +2: 1-based + header row */
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        background: isEven ? "var(--bg)" : "rgba(126,200,227,0.04)",
        borderBottom: "1px solid var(--border)",
        boxSizing: "border-box",
      }}
    >
      {COLUMNS.map(({ key, width }) => (
        <div
          key={key}
          role="cell"
          style={{ width, padding: "0 1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.875rem" }}
          title={key === "txHash" ? row[key] : undefined}
        >
          {key === "feeValidationStatus" ? (
            <StatusBadge status={row[key]} />
          ) : key === "txHash" ? (
            <span style={{ fontFamily: "monospace", color: "var(--muted)" }}>{truncate(row[key], 14)}</span>
          ) : key === "confirmedAt" ? (
            formatDate(row[key])
          ) : key === "amount" || key === "feeAmount" ? (
            `${row[key] ?? "—"} XLM`
          ) : (
            row[key] ?? "—"
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * PaymentTable — renders a list of payment records.
 * Automatically virtualizes when rows > VIRTUALIZE_THRESHOLD (100).
 *
 * @param {{ payments: Array }} props
 */
export default function PaymentTable({ payments = [] }) {
  if (payments.length === 0) {
    return (
      <p style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>
        No payment records found.
      </p>
    );
  }

  const header = (
    <div
      role="row"
      aria-rowindex={1}
      style={{
        display: "flex",
        borderBottom: "2px solid var(--border)",
        background: "var(--bg)",
      }}
    >
      {COLUMNS.map(({ key, label, width }) => (
        <div
          key={key}
          role="columnheader"
          scope="col"
          style={{
            width,
            padding: "0.6rem 1rem",
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--muted)",
            fontWeight: 600,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );

  const useVirtual = payments.length > VIRTUALIZE_THRESHOLD;

  return (
    <div
      role="grid"
      aria-label="Payment history"
      aria-rowcount={payments.length + 1}
      aria-colcount={COLUMNS.length}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      {header}
      {useVirtual ? (
        <FixedSizeList
          height={LIST_HEIGHT}
          itemCount={payments.length}
          itemSize={ROW_HEIGHT}
          itemData={payments}
          width="100%"
          overscanCount={5}
        >
          {Row}
        </FixedSizeList>
      ) : (
        <div role="rowgroup">
          {payments.map((row, index) => (
            <Row
              key={row.txHash || index}
              index={index}
              style={{ position: "relative", height: ROW_HEIGHT }}
              data={payments}
            />
          ))}
        </div>
      )}
    </div>
  );
}
