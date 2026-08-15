import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { BottomNav } from '@/components/bottom-nav';
import { StoreProvider } from '@/lib/store/provider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Gut Tracker',
  description:
    'Log what you eat and how you feel. Find out which foods actually track with your symptoms — open source, and yours to keep.',
  applicationName: 'Gut Tracker',
  appleWebApp: { capable: true, title: 'Gut Tracker', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0e1211',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <StoreProvider>
          <div className="mx-auto w-full max-w-md px-4 pt-5">{children}</div>
          <BottomNav />
        </StoreProvider>
      </body>
    </html>
  );
}
