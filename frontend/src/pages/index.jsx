import Head from "next/head";
import Link from "next/link";

const FEATURES = [
  { icon: "⚡", title: "Instant Confirmation", desc: "Payments settle on the Stellar blockchain in 3–5 seconds." },
  { icon: "🔒", title: "Immutable Records", desc: "Every transaction is permanently recorded and publicly verifiable." },
  { icon: "🔄", title: "Auto Reconciliation", desc: "Student IDs in the memo field eliminate manual matching." },
];

export default function Home() {
  return (
    <>
      <Head>
        <title>StellarEduPay</title>
        <meta name="description" content="Transparent, instant school fee payments on the Stellar blockchain." />
      </Head>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hero-title   { animation: fadeUp 0.6s ease both; }
        .hero-sub     { animation: fadeUp 0.6s 0.15s ease both; }
        .hero-actions { animation: fadeUp 0.6s 0.3s ease both; }
        .features     { animation: fadeUp 0.6s 0.45s ease both; }

        .feature-card {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 2rem 1.5rem;
          flex: 1;
          min-width: 200px;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
        }
        .btn-outline {
          background: transparent;
          border: 1.5px solid var(--accent);
          color: var(--accent);
          padding: 0.75rem 1.75rem;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 1rem;
          transition: background 0.2s, color 0.2s;
        }
        .btn-outline:hover {
          background: var(--accent);
          color: #fff;
        }
      `}</style>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "5rem 1rem 3rem" }}>
        <p className="hero-sub" style={{ color: "var(--accent)", fontWeight: 600, letterSpacing: "0.1em", fontSize: "0.85rem", marginBottom: "1rem", textTransform: "uppercase" }}>
          Blockchain-Powered Payments
        </p>
        <h1 className="hero-title" style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 800, lineHeight: 1.15, marginBottom: "1.25rem" }}>
          School fees, settled<br />in seconds.
        </h1>
        <p className="hero-sub" style={{ color: "var(--muted)", fontSize: "1.1rem", maxWidth: 480, margin: "0 auto 2.5rem" }}>
          Transparent, instant, and fraud-proof fee payments on the Stellar network — no manual reconciliation needed.
        </p>
        <div className="hero-actions" style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/pay-fees">
            <button className="btn-primary" style={{ padding: "0.75rem 1.75rem", fontSize: "1rem" }}>Pay Fees</button>
          </Link>
          <Link href="/dashboard">
            <button className="btn-outline">View Dashboard</button>
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="features" style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem 5rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        {FEATURES.map(({ icon, title, desc }) => (
          <div key={title} className="feature-card">
            <div style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>{icon}</div>
            <h3 style={{ marginBottom: "0.5rem", fontSize: "1rem" }}>{title}</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>{desc}</p>
          </div>
        ))}
      </div>
    </>
  );
}
