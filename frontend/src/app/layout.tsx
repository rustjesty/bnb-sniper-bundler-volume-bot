
'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import '../lib/polyfills';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
require('@solana/wallet-adapter-react-ui/styles.css');

const inter = Inter({ subsets: ['latin'] });

// Dynamically import Navbar with no SSR
const Navbar = dynamic(() => import('../components/Navbar'), { ssr: false });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  // Only initialize wallet adapter on client side
  const [wallets] = useState(() => [new PhantomWalletAdapter()]);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletProvider 
          wallets={wallets} 
          autoConnect={false} // Disable auto-connect
        >
          <WalletModalProvider>
            {mounted && (
              <>
                <Navbar />
                <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
                  {children}
                </main>
              </>
            )}
          </WalletModalProvider>
        </WalletProvider>
      </body>
    </html>
  );
}