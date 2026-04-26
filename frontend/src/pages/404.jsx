import Link from 'next/link';
import Navbar from '../components/Navbar';

export default function Custom404() {
  return (
    <>
      <style>{`
        .not-found-wrap {
          min-height: calc(100vh - 60px);
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          padding: 2rem;
        }
        .not-found-card {
          text-align: center;
          max-width: 500px;
          background: var(--bg);
          border: 1px solid var(--border);
          padding: 3rem 2rem;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .not-found-icon {
          font-size: 5rem;
          margin-bottom: 1rem;
        }
        .not-found-code {
          font-size: 4rem;
          font-weight: 700;
          color: var(--primary);
          margin: 0 0 0.5rem 0;
          line-height: 1;
        }
        .not-found-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text);
          margin: 0 0 1rem 0;
        }
        .not-found-desc {
          font-size: 1rem;
          color: var(--muted);
          line-height: 1.6;
          margin-bottom: 2rem;
        }
        .not-found-btn {
          display: inline-block;
          padding: 0.75rem 2rem;
          background: var(--primary);
          color: #fff;
          text-decoration: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          transition: opacity 0.2s;
        }
        .not-found-btn:hover {
          opacity: 0.85;
        }
        .not-found-links {
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
        }
        .not-found-links-label {
          font-size: 0.9rem;
          color: var(--muted);
          margin-bottom: 0.75rem;
        }
        .not-found-links-row {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }
        .not-found-link {
          color: var(--accent);
          text-decoration: none;
          font-size: 0.9rem;
        }
        .not-found-link:hover {
          text-decoration: underline;
        }
      `}</style>

      <Navbar />

      <div className="not-found-wrap">
        <div className="not-found-card">
          <div className="not-found-icon" aria-hidden="true">🌟</div>

          <h1 className="not-found-code">404</h1>

          <h2 className="not-found-title">Page Not Found</h2>

          <p className="not-found-desc">
            Oops! The page you&apos;re looking for doesn&apos;t exist in StellarEduPay.
            It might have been moved or deleted.
          </p>

          <Link href="/" className="not-found-btn">
            ← Back to Home
          </Link>

          <div className="not-found-links">
            <p className="not-found-links-label">Or try these pages:</p>
            <div className="not-found-links-row">
              <Link href="/dashboard" className="not-found-link">Dashboard</Link>
              <Link href="/pay-fees" className="not-found-link">Pay Fees</Link>
              <Link href="/reports" className="not-found-link">Reports</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
