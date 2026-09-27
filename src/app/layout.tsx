import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/vazirmatn';
import './globals.css';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';

export const metadata: Metadata = {
  title: { default: `${BRAND_NAME} | ${BRAND_TAGLINE}`, template: `%s | ${BRAND_NAME}` },
  description: 'قسط‌ها و پرداخت‌های اعتباری‌ات رو در پی‌نو ثبت کن و همیشه بدون چه مبلغی رو چه زمانی باید پرداخت کنی.',
  applicationName: BRAND_NAME,
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f3f5f7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
