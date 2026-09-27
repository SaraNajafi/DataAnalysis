'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ fontFamily: 'Tahoma, sans-serif', textAlign: 'center', padding: '4rem 1rem' }}>
        <h1>مشکلی پیش اومد</h1>
        <p>ارتباط برقرار نشد. دوباره تلاش کن.</p>
        <button type="button" onClick={() => reset()} style={{ marginTop: '1rem', padding: '0.75rem 1.5rem' }}>
          تلاش دوباره
        </button>
      </body>
    </html>
  );
}
