'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { PublicKey } from '@solana/web3.js';
import logger from '@/utils/logger';
import { isValidBase58 } from '@/utils/validation';

// Dynamically import components to prevent SSR issues
const Trading = dynamic(() => import('@/components/Trading'), { ssr: false });
const SwapInterface = dynamic(() => import('@/components/SwapInterface'), { ssr: false });
const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });
const MarketData = dynamic(() => import('@/components/MarketData'), { ssr: false });

// Types
interface Token {
  address: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  publicKey?: PublicKey;
}

interface ChartConfig {
  type: 'line';
  timeframe: '24h';
  metric: 'price';
  data: any[];
}

// Constants
const DEFAULT_TOKEN_ADDRESSES = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  JENNA: '8hVzPgFopqEQmNNoghr5WbPY1LEjW8GzgbLRwuwHpump'
} as const;

// Validation helper
const validateTokenAddress = (address: string): boolean => {
  if (!address || typeof address !== 'string') return false;
  if (!isValidBase58(address)) return false;
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

export default function TradingPage() {
  // State management with proper typing
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<string>('SOL');
  const [retryCount, setRetryCount] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [mounted, setMounted] = useState(false);

  const [chartConfig] = useState<ChartConfig>({
    type: 'line',
    timeframe: '24h',
    metric: 'price',
    data: []
  });

  // Mount effect to prevent hydration issues
  useEffect(() => {
    setMounted(true);
  }, []);

  // Safe token creation with proper error handling
  const createSafeToken = async (address: string): Promise<Token | null> => {
    if (!validateTokenAddress(address)) {
      logger.warn(`Invalid token address: ${address}`);
      return null;
    }

    try {
      const response = await fetch(`/api/token/${address}`);
      if (!response.ok) throw new Error('Failed to fetch token info');
      
      const info = await response.json();
      return {
        address,
        symbol: info.symbol || 'Unknown',
        decimals: info.decimals || 9,
        logoURI: info.logoURI,
        publicKey: new PublicKey(address)
      };
    } catch (err) {
      logger.error(`Error creating token for ${address}:`, err);
      return null;
    }
  };

  // Token fetching with proper error handling
  useEffect(() => {
    if (!mounted) return;

    const RETRY_LIMIT = 3;
    const RETRY_DELAY = 2000;
    const RATE_LIMIT_WINDOW = 5000;

    const fetchTokens = async () => {
      const now = Date.now();
      if (now - lastFetchTime < RATE_LIMIT_WINDOW) return;

      try {
        setLoading(true);
        setError(null);
        setLastFetchTime(now);

        const tokenPromises = Object.values(DEFAULT_TOKEN_ADDRESSES)
          .map(address => createSafeToken(address));

        const results = await Promise.allSettled(tokenPromises);
        const validTokens = results
          .filter((result): result is PromiseFulfilledResult<Token> => 
            result.status === 'fulfilled' && result.value !== null
          )
          .map(result => result.value);

        if (validTokens.length === 0) {
          throw new Error('No valid tokens found');
        }

        setTokens(validTokens);
      } catch (err) {
        logger.error('Token fetch error:', err);
        if (retryCount < RETRY_LIMIT) {
          setRetryCount(prev => prev + 1);
          setTimeout(fetchTokens, RETRY_DELAY);
        } else {
          setError('Failed to load tokens. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTokens();
  }, [retryCount, lastFetchTime, mounted]);

  // Enhanced swap handler with proper validation
  const handleSwap = async (params: {
    inputToken: Token;
    outputToken: Token;
    amount: string;
    slippage: number;
  }) => {
    try {
      if (!params.inputToken?.address || !params.outputToken?.address) {
        throw new Error('Please select both tokens');
      }

      if (!validateTokenAddress(params.inputToken.address) || 
          !validateTokenAddress(params.outputToken.address)) {
        throw new Error('Invalid token address');
      }

      const amount = parseFloat(params.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Please enter a valid amount');
      }

      setLoading(true);
      setError(null);

      const response = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputToken: params.inputToken.address,
          outputToken: params.outputToken.address,
          amount: amount.toString(),
          slippage: params.slippage
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Swap failed');
      }

      const { txHash } = await response.json();
      return txHash;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Swap failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return null; // Prevent hydration issues
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Trading</h1>
      
      {error && (
        <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button 
            onClick={() => {
              setError(null);
              setRetryCount(0);
            }}
            className="text-sm bg-red-100 dark:bg-red-800 px-3 py-1 rounded-md hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <SwapInterface 
            tokens={tokens}
            onSwap={handleSwap}
            loading={loading}
            error={error}
            visible={true}
            onClose={() => {}}
          />
          <MarketData 
            token={selectedToken}
            metric="price"
          />
        </div>
        <div className="space-y-6">
          <Chart 
            chartConfig={chartConfig}
            isLoading={loading}
          />
          <Trading />
        </div>
      </div>
    </div>
  );
}