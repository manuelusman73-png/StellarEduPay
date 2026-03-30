import Link from 'next/link';
import Navbar from '../components/Navbar';

export default function Custom404() {
  return (
    <>
      <Navbar />
      
      <div style={{
        minHeight: 'calc(100vh - 60px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        padding: '2rem',
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: '500px',
          background: '#fff',
          padding: '3rem 2rem',
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}>
          {/* 404 Icon */}
          <div style={{
            fontSize: '5rem',
            marginBottom: '1rem',
          }} aria-hidden="true">
            🌟
          </div>

          {/* Error Code */}
          <h1 style={{
            fontSize: '4rem',
            fontWeight: 700,
            color: '#1a1a2e',
            margin: '0 0 0.5rem 0',
            lineHeight: 1,
          }}>
            404
          </h1>

          {/* Error Message */}
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: 600,
            color: '#333',
            margin: '0 0 1rem 0',
          }}>
            Page Not Found
          </h2>

          <p style={{
            fontSize: '1rem',
            color: '#666',
            lineHeight: 1.6,
            marginBottom: '2rem',
          }}>
            Oops! The page you're looking for doesn't exist in StellarEduPay. 
            It might have been moved or deleted.
          </p>

          {/* Back to Home Button */}
          <Link
            href="/"
            style={{
              display: 'inline-block',
              padding: '0.75rem 2rem',
              background: '#1a1a2e',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 600,
              transition: 'background 0.3s ease',
            }}
            onMouseEnter={(e) => e.target.style.background = '#2d2d4a'}
            onMouseLeave={(e) => e.target.style.background = '#1a1a2e'}
          >
            ← Back to Home
          </Link>

          {/* Additional Links */}
          <div style={{
            marginTop: '2rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid #e0e0e0',
          }}>
            <p style={{
              fontSize: '0.9rem',
              color: '#888',
              marginBottom: '0.75rem',
            }}>
              Or try these pages:
            </p>
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}>
              <Link
                href="/dashboard"
                style={{
                  color: '#7ec8e3',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                }}
              >
                Dashboard
              </Link>
              <Link
                href="/pay-fees"
                style={{
                  color: '#7ec8e3',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                }}
              >
                Pay Fees
              </Link>
              <Link
                href="/reports"
                style={{
                  color: '#7ec8e3',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                }}
              >
                Reports
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
