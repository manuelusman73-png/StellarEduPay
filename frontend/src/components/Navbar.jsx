import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import TestnetBanner from './TestnetBanner';

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/pay-fees", label: "Pay Fees" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
];

export default function Navbar() {
  const { pathname } = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <style>{`
        .nav-link { color: #ccc; text-decoration: none; font-size: 0.95rem; padding: 0.25rem 0; white-space: nowrap; }
        .nav-link:hover { color: #fff; }
        .nav-link.active { color: #fff; font-weight: 700; border-bottom: 2px solid #7ec8e3; }
        @media (max-width: 600px) {
          .nav-links { display: none; flex-direction: column; gap: 0.75rem; padding: 1rem 2rem; background: #1a1a2e; }
          .nav-links.open { display: flex; }
          .hamburger { display: flex !important; }
        }
      `}</style>

      <TestnetBanner />

      <nav style={{ background: '#1a1a2e', padding: '0.75rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Brand */}
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}
        >
          <span style={{ fontSize: "1.3rem" }} aria-hidden="true">
            🌟
          </span>
          <span
            style={{ color: "#fff", fontWeight: 700, fontSize: "1rem", letterSpacing: "0.02em" }}
          >
            StellarEduPay
          </span>
        </Link>

        {/* Desktop links */}
        <div className="nav-links" style={{ display: "flex", gap: "1.75rem" }}>
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link${pathname === href ? " active" : ""}`}
              aria-current={pathname === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Hamburger (hidden on desktop via media query) */}
        <button
          className="hamburger"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          style={{
            display: "none",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#fff",
            fontSize: "1.4rem",
            lineHeight: 1,
            padding: 0,
          }}
        >
          {open ? "✕" : "☰"}
        </button>
      </nav>

      {/* Mobile dropdown */}
      <div className={`nav-links${open ? " open" : ""}`}>
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link${pathname === href ? " active" : ""}`}
            aria-current={pathname === href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {label}
          </Link>
        ))}
      </div>
    </>
  );
}
