'use client';

import { useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  
} from '@solana/wallet-adapter-wallets';
import dynamic from 'next/dynamic';

// Import wallet styles
require('@solana/wallet-adapter-react-ui/styles.css');

// Dynamically import Navbar
const Navbar = dynamic(() => import('../shared/Navbar'), { 
  ssr: false 
});

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const [mounted, setMounted] = useState(false);

  // Initialize endpoint
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl('mainnet-beta');

  // Initialize wallets
  const [wallets] = useState(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    
  ]);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {mounted ? (
            <div className="flex flex-col min-h-screen">
              <Navbar />
              <main className="flex-1 bg-gray-50 dark:bg-gray-900">
                {children}
              </main>
              <footer className="py-4 px-4 border-t dark:border-gray-800">
                <div className="max-w-7xl mx-auto text-center text-sm text-gray-500 dark:text-gray-400">
                  <span>JENNA AI Assistant</span>
                  <span className="mx-2">•</span>
                  <a
                    href="https://pump.fun/coin/8hVzPgFopqEQmNNoghr5WbPY1LEjW8GzgbLRwuwHpump"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-500 hover:text-purple-600"
                  >
                    View JENNA Token
                  </a>
                </div>
              </footer>
            </div>
          ) : (
            <div className="flex min-h-screen items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            </div>
          )}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}