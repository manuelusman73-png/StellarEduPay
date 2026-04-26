export default function TestnetBanner() {
  const isTestnet = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'testnet';

  if (!isTestnet) return null;

  return (
    <div
      role="alert"
      style={{
        background: '#ff9800',
        color: '#000',
        padding: '0.5rem 2rem',
        textAlign: 'center',
        fontWeight: 600,
        fontSize: '0.9rem',
      }}
    >
      ⚠️ TESTNET MODE — Do not send real funds
    </div>
  );
}
