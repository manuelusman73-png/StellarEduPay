import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import TestnetBanner from './TestnetBanner';
import { useTheme } from '../pages/_app';
import { useAdminAuth } from '../hooks/useAdminAuth';

const PUBLIC_LINKS = [
  { href: "/", label: "Home" },
  { href: "/pay-fees", label: "Pay Fees" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
];

const ADMIN_LINKS = [
  { href: "/fee-adjustments", label: "Fee Rules" },
  { href: "/audit-logs", label: "Audit Logs" },
];

export default function Navbar() {
  const { pathname } = useRouter();
  const [open, setOpen] = useState(false);
  const { dark, toggle } = useTheme();
  const { isAdmin, logout } = useAdminAuth();

  const LINKS = isAdmin ? [...PUBLIC_LINKS, ...ADMIN_LINKS] : PUBLIC_LINKS;

  // Close the mobile menu on every route change, including browser back/forward.
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      <style>{`
        nav .nav-link { color: rgba(255,255,255,0.75); text-decoration: none; font-size: 0.9rem; padding: 0.25rem 0; white-space: nowrap; transition: color 0.15s; }
        nav .nav-link:hover { color: #fff; }
        nav .nav-link.active { color: #fff; font-weight: 600; border-bottom: 2px solid #7ec8e3; }
        .nav-links .nav-link, .nav-mobile .nav-link { color: rgba(255,255,255,0.75); text-decoration: none; }
        .nav-links .nav-link:hover, .nav-links .nav-link.active,
        .nav-mobile .nav-link:hover, .nav-mobile .nav-link.active { color: #fff; }
        .nav-links { display: flex; gap: 1.75rem; }
        @media (max-width: 600px) {
          .nav-links { display: none; flex-direction: column; gap: 0.75rem; padding: 1rem 2rem; background: #1a1a2e; }
          .nav-links.open { display: flex; }
          .hamburger { display: flex !important; }
        }
        .nav-mobile { display: none; }
        @media (max-width: 600px) {
          .nav-mobile { display: none; flex-direction: column; gap: 0.75rem; padding: 1rem 2rem; background: #1a1a2e; }
          .nav-mobile.open { display: flex; }
        }
      `}</style>

      <TestnetBanner />

      <nav style={{ background: '#1a1a2e', padding: '0.75rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Brand */}
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "1rem", letterSpacing: "0.02em" }}>
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

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: dark ? "#7ec8e3" : "rgba(255,255,255,0.15)",
              border: "none",
              borderRadius: "20px",
              cursor: "pointer",
              color: "#fff",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              padding: "0.3rem 0.75rem",
              transition: "background 0.2s",
            }}
          >
            {dark ? "LIGHT" : "DARK"}
          </button>

          {/* Admin login / logout */}
          {isAdmin ? (
            <button
              onClick={logout}
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "none",
                borderRadius: "20px",
                cursor: "pointer",
                color: "#fff",
                fontSize: "0.75rem",
                fontWeight: 600,
                letterSpacing: "0.05em",
                padding: "0.3rem 0.75rem",
              }}
            >
              LOGOUT
            </button>
          ) : (
            <Link
              href="/login"
              style={{
                background: "rgba(255,255,255,0.15)",
                borderRadius: "20px",
                color: "#fff",
                fontSize: "0.75rem",
                fontWeight: 600,
                letterSpacing: "0.05em",
                padding: "0.3rem 0.75rem",
                textDecoration: "none",
              }}
            >
              ADMIN
            </Link>
          )}

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
        </div>
      </nav>

      {/* Mobile dropdown */}
      <div className={`nav-mobile${open ? " open" : ""}`}>
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
