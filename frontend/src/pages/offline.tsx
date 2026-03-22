import Head from 'next/head';

export default function OfflinePage() {
  return (
    <>
      <Head>
        <title>GSTD — Offline</title>
      </Head>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #030014 0%, #0a1929 50%, #1a0a2e 100%)',
        color: '#fff',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📡</div>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #d4af37, #f5d76e)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '1rem',
        }}>
          You&apos;re Offline
        </h1>
        <p style={{ color: '#8892b0', fontSize: '1.1rem', maxWidth: '400px', lineHeight: 1.6 }}>
          GSTD Sovereign Network requires an internet connection. 
          Your cached data is still available — reconnect to access live AI services.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '2rem',
            padding: '12px 32px',
            background: 'linear-gradient(135deg, #d4af37, #b8941f)',
            color: '#000',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🔄 Try Again
        </button>
      </div>
    </>
  );
}
