'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl, Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
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

interface WalletAsset {
  mint: string;
  symbol: string;
  amount: number;
  value: number;
  price: number;
}

interface WalletTransaction {
  signature: string;
  type: string;
  amount: number;
  timestamp: string;
  status: 'success' | 'error' | 'pending';
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletProviderState>({
    retryCount: 0,
    error: null,
    isConnecting: false
  });

  const [isReady, setIsReady] = useState(false);

  const endpoint = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl('mainnet-beta');
  const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

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

  const handleError = (error: Error | WalletError) => {
    logger.error('Wallet error:', error);
    setState(prev => ({ ...prev, error }));

    if (error.name === 'WalletConnectionError') {
      tryConnect();
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        // Simulate SDK initialization
        await new Promise(resolve => setTimeout(resolve, 1000));
        setIsReady(true);
      } catch (error) {
        console.error('Initialization failed:', error);
      }
    };
    
    initialize();
  }, []);

  useEffect(() => {
    tryConnect();
  }, [tryConnect]);

  if (!isReady) return <div className="loading-indicator">Initializing JENNA...</div>;

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
          autoConnect={true}
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

interface WalletConnectProps {
  onConnect?: (address: string) => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export function WalletConnect({
  onConnect,
  onDisconnect,
  onError
}: WalletConnectProps) {
  const { connection } = useConnection();
  const { publicKey, connected, disconnect } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [recentTxs, setRecentTxs] = useState<WalletTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (connected && publicKey) {
      loadWalletData();
      onConnect?.(publicKey.toString());
    }
  }, [connected, publicKey]);

  const loadWalletData = async () => {
    if (!publicKey) return;

    setIsLoading(true);
    try {
      await Promise.all([
        loadBalance(),
        loadTokenAccounts(),
        loadTransactions()
      ]);
    } catch (error) {
      handleError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBalance = async () => {
    try {
      if (!publicKey) return;
      const balanceInLamports = await connection.getBalance(publicKey);
      setBalance(balanceInLamports / LAMPORTS_PER_SOL);
    } catch (error) {
      logger.error('Error loading balance:', error);
    }
  };

  const loadTokenAccounts = async () => {
    try {
      if (!publicKey) return;
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      );

      const assetsData: WalletAsset[] = tokenAccounts.value.map(account => {
        const tokenData = account.account.data.parsed.info;
        return {
          mint: tokenData.mint,
          symbol: tokenData.symbol || 'Unknown',
          amount: tokenData.tokenAmount.uiAmount || 0,
          price: 0, // You can fetch prices from an API if needed
          value: 0
        };
      });

      setAssets(assetsData);
    } catch (error) {
      logger.error('Error loading token accounts:', error);
    }
  };

  const loadTransactions = async () => {
    try {
      if (!publicKey) return;
      const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 10 });
      
      const txs: WalletTransaction[] = signatures.map(sig => ({
        signature: sig.signature,
        type: 'transfer', // You can add more transaction type detection logic
        amount: 0, // You can add amount parsing logic
        timestamp: new Date(sig.blockTime! * 1000).toISOString(),
        status: sig.confirmationStatus === 'finalized' ? 'success' : 'pending'
      }));

      setRecentTxs(txs);
    } catch (error) {
      logger.error('Error loading transactions:', error);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setBalance(null);
      setAssets([]);
      setRecentTxs([]);
      onDisconnect?.();
    } catch (error) {
      handleError(error);
    }
  };

  const handleError = (error: any) => {
    const message = error instanceof Error ? error.message : 'An error occurred';
    setError(message);
    onError?.(error instanceof Error ? error : new Error(message));
  };

  return (
    <div className="space-y-6">
      {/* Wallet Connection */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-between items-center">
          <div>
            {connected && publicKey ? (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connected Wallet
                </p>
                <p className="font-mono text-sm">
                  {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
                </p>
                {balance !== null && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Balance: {balance.toFixed(4)} SOL
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <WalletMultiButton className="px-4 py-2 rounded-lg font-medium" />
        </div>
      </div>

      {/* Assets Section */}
      {connected && assets.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-medium mb-4">Assets</h3>
          <div className="space-y-3">
            {assets.map((asset) => (
              <div
                key={asset.mint}
                className="flex justify-between items-center p-3 border rounded-lg dark:border-gray-700"
              >
                <div>
                  <p className="font-medium">{asset.symbol}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {asset.amount.toFixed(4)} tokens
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transactions Section */}
      {connected && recentTxs.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-medium mb-4">Recent Transactions</h3>
          <div className="space-y-3">
            {recentTxs.map((tx) => (
              <div
                key={tx.signature}
                className="flex justify-between items-center p-3 border rounded-lg dark:border-gray-700"
              >
                <div>
                  <p className="font-medium">{tx.type}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {new Date(tx.timestamp).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">
                    {tx.amount.toFixed(4)} SOL
                  </p>
                  <p className={`text-sm ${
                    tx.status === 'success'
                      ? 'text-green-500'
                      : tx.status === 'error'
                      ? 'text-red-500'
                      : 'text-yellow-500'
                  }`}>
                    {tx.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}