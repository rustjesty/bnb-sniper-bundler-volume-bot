'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import '../lib/polyfills';
import dynamic from 'next/dynamic';

const inter = Inter({ subsets: ['latin'] });

// Dynamically import RootLayout to avoid SSR issues
const RootLayout = dynamic(() => import('@/components/layout/RootLayout'), { 
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
    </div>
  )
});

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <RootLayout>
          {children}
        </RootLayout>
      </body>
    </html>
  );
}