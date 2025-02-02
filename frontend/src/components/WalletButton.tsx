'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Import WalletMultiButton dynamically with no SSR
const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { 
    ssr: false,
    loading: () => <div className="h-10 w-32 bg-purple-600 rounded-lg animate-pulse" />
  }
);

export function WalletButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-10 w-32 bg-purple-600 rounded-lg" />;
  }

  return (
    <WalletMultiButton className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg" />
  );
}
