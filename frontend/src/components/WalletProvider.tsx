'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl, Connection } from '@solana/web3.js';
import { ErrorBoundary } from 'react-error-boundary';
import logger from '@/utils/logger';
import { WalletError } from '@solana/wallet-adapter-base';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const CONNECTION_TIMEOUT = 30000;

interface WalletProviderState {
  retryCount: number;
  error: Error | null;
  isConnecting: boolean;
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletProviderState>({
    retryCount: 0,
    error: null,
    isConnecting: false
  });

  const [mounted, setMounted] = useState(false);

  // Get RPC endpoint from env or fallback to default
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl('mainnet-beta');
  const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

  // Connection retry logic
  const tryConnect = useCallback(async () => {
    if (state.retryCount >= MAX_RETRIES) {
      throw new Error('Max connection retries exceeded');
    }

    try {
      const connection = new Connection(endpoint, {
        commitment: 'confirmed',
        wsEndpoint: endpoint.replace('https', 'wss'),
        confirmTransactionInitialTimeout: CONNECTION_TIMEOUT
      });

      await connection.getVersion();
      setState(prev => ({ ...prev, error: null, isConnecting: false }));
      return connection;

    } catch (error) {
      setState(prev => ({
        retryCount: prev.retryCount + 1,
        error: error as Error,
        isConnecting: true
      }));

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return tryConnect();
    }
  }, [endpoint, state.retryCount]);

  // Error handling
  const handleError = (error: Error | WalletError) => {
    logger.error('Wallet error:', error);
    setState(prev => ({ ...prev, error }));

    if (error.name === 'WalletConnectionError') {
      tryConnect();
    }
  };

  // Handle mounting
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      tryConnect();
    }
  }, [tryConnect, mounted]);

  // Don't render until mounted
  if (!mounted) return null;

  if (state.error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/30 rounded">
        <h3 className="text-red-600 dark:text-red-400">Wallet Error</h3>
        <p>{state.error.message}</p>
        <button 
          onClick={() => tryConnect()}
          className="mt-2 px-4 py-2 bg-red-500 text-white rounded"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary 
      FallbackComponent={WalletErrorBoundary}
      onError={handleError}
    >
      <ConnectionProvider endpoint={endpoint}>
        <SolanaWalletProvider 
          wallets={wallets}
          onError={handleError}
          autoConnect={false} // Explicitly disable auto-connect
        >
          <WalletModalProvider>
            {children}
            {state.isConnecting && (
              <div className="fixed bottom-4 right-4 bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded">
                Reconnecting... (Attempt {state.retryCount + 1}/{MAX_RETRIES})
              </div>
            )}
          </WalletModalProvider>
        </SolanaWalletProvider>
      </ConnectionProvider>
    </ErrorBoundary>
  );
}

function WalletErrorBoundary({ error }: { error: Error }) {
  return (
    <div className="p-4 bg-red-50 dark:bg-red-900/30 rounded">
      <h3 className="text-red-600 dark:text-red-400">Wallet Error</h3>
      <p>{error.message}</p>
    </div>
  );
}