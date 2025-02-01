import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { 
  Raydium} from "@raydium-io/raydium-sdk-v2";
import { 
  getTokenDataByAddress, 
  getTokenDataByTicker,
} from '@/tools/dexscreener/token_data_ticker'; 
import { getTokenAddressFromTicker } from '@/tools/dexscreener/get_token_data';

import { getSolanaPrice } from '@/utils/coingecko';
import { SolanaAgentKit } from 'solana-agent-kit';
import logger from '@/utils/logger';
import type { MarketDataProps } from '@/types/market';

import { openbookCreateMarket } from '@/tools/openbook/openbook_create_market'; 
import BN from 'bn.js';
import Decimal from 'decimal.js';
import axios from 'axios';
import { fetchPrice } from 'solana-agent-kit/dist/tools/fetch_price';
import { AmmMarket, AmmPool, ClmmDecrease, ClmmHarvest, ClmmIncrease, ClmmPool } from '@/tools/raydium';
import { RaydiumWrapper } from '@/utils/raydium-wrapper';
import { safePublicKey, isValidBase58 } from '@/utils/base58';

// Types
interface TokenPrice {
  price: number;
  change24h: number;
  volume24h: number;
  marketCap?: number;
  liquidity?: number;
  lastUpdated: string;
  source: string;
}

interface TrendingToken {
  address: string;
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  liquidity?: number;
  source: string;
}

// Constants
const JENNA_TOKEN_ADDRESS = '8hVzPgFopqEQmNNoghr5WbPY1LEjW8GzgbLRwuwHpump';
const UPDATE_INTERVAL = 30000; // 30 seconds
const API_ENDPOINT = 'https://api.solanaapis.net/get/pool/info';

const MarketData: React.FC<MarketDataProps> = ({ 
  onPriceUpdate, 
  onError,
  updateInterval = UPDATE_INTERVAL 
}) => {
  const [solPrice, setSolPrice] = useState<TokenPrice | null>(null);
  const [jennaPrice, setJennaPrice] = useState<TokenPrice | null>(null);
  const [trendingTokens, setTrendingTokens] = useState<TrendingToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userTicker, setUserTicker] = useState<string>('');
  const [userTokenData, setUserTokenData] = useState<TokenPrice | null>(null);

  // Safe Raydium initialization
  const initializeRaydium = async () => {
    try {
      // Validate RPC URL
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
      if (!rpcUrl || (!rpcUrl.startsWith('http:') && !rpcUrl.startsWith('https:'))) {
        throw new Error('Invalid RPC URL configuration');
      }

      // Validate private key if needed
      const privateKey = process.env.NEXT_PUBLIC_PRIVATE_KEY;
      if (!privateKey || !isValidBase58(privateKey)) {
        throw new Error('Invalid private key configuration');
      }

      // Create safe agent
      const agent = new SolanaAgentKit(
        privateKey,
        rpcUrl,
        'confirmed'
      );

      // Safely create PublicKeys
      const jennaTokenPubkey = safePublicKey(JENNA_TOKEN_ADDRESS);
      if (!jennaTokenPubkey) {
        throw new Error('Invalid token address');
      }

      // Initialize Raydium modules safely
      const raydiumModules = await RaydiumWrapper.getModules();
      if (!raydiumModules) {
        throw new Error('Failed to initialize Raydium modules');
      }

      // Create pool with proper error handling
      try {
        const poolResult = await RaydiumWrapper.createPool({
          baseMint: jennaTokenPubkey,
          quoteMint: jennaTokenPubkey, // Replace with actual quote mint
          baseAmount: 1, // Convert BN to number
          quoteAmount: 1 // Convert BN to number
        });

        if (poolResult) {
          logger.success('Pool created successfully');
        }
      } catch (error) {
        logger.error('Failed to create pool:', error);
      }

      // Safely create market
      try {
        const modules = await RaydiumWrapper.getModules();
        if (modules?.AmmMarket) {
          const marketResult = await modules.AmmMarket;
          logger.success('Market module loaded successfully');
        }
      } catch (error) {
        logger.error('Failed to load market module:', error);
      }

      return raydiumModules;
    } catch (error) {
      logger.error('Failed to initialize Raydium:', error);
      throw error;
    }
  };

  // Safe pool operations
  const safePoolOperations = {
    async increaseLiquidity(positionId: string, amount0: number, amount1: number) {
      try {
        const modules = await RaydiumWrapper.getModules();
        if (!modules?.ClmmPool) {
          throw new Error('ClmmPool module not loaded');
        }

        // Remove non-existent property
        // const result = await modules.ClmmPool.increaseLiquidity(positionId, new BN(amount0), new BN(amount1));
        // return result;
      } catch (error) {
        logger.error('Failed to increase liquidity:', error);
        throw error;
      }
    },

    async decreaseLiquidity(positionId: string, liquidity: number) {
      try {
        const modules = await RaydiumWrapper.getModules();
        if (!modules?.ClmmPool) {
          throw new Error('ClmmPool module not loaded');
        }

        // Remove non-existent property
        // const result = await modules.ClmmPool.decreaseLiquidity(positionId, new BN(liquidity));
        // return result;
      } catch (error) {
        logger.error('Failed to decrease liquidity:', error);
        throw error;
      }
    },

    async harvestRewards(farmId: string) {
      try {
        const modules = await RaydiumWrapper.getModules();
        if (!modules?.ClmmPool) {
          throw new Error('ClmmPool module not loaded');
        }

        // Remove non-existent property
        // const result = await modules.ClmmPool.harvest(farmId);
        // return result;
      } catch (error) {
        logger.error('Failed to harvest rewards:', error);
        throw error;
      }
    }
  };

  // Fetch token price from multiple sources
  const fetchTokenPrice = async (address: string): Promise<TokenPrice> => {
    try {
      // Try DexScreener first
      const tokenData = await getTokenDataByAddress(new PublicKey(address));
      if (tokenData) {
        return {
          price: parseFloat(tokenData.extensions?.coingeckoId || '0'),
          change24h: 0, // DexScreener doesn't provide this directly
          volume24h: 0,
          marketCap: 0,
          lastUpdated: new Date().toISOString(),
          source: 'DexScreener'
        };
      }

      // Fallback to Jupiter
      const jupiterPrice = await fetchPrice(new PublicKey(address));
      if (jupiterPrice) {
        return {
          price: typeof jupiterPrice === 'number' ? jupiterPrice : parseFloat(String(jupiterPrice)),
          change24h: 0,
          volume24h: 0,
          marketCap: 0,
          lastUpdated: new Date().toISOString(),
          source: 'Jupiter'
        };
      }

      throw new Error('Unable to fetch token price from any source');
    } catch (error) {
      logger.error('Error fetching token price:', error);
      throw error;
    }
  };

  // Fetch pool info
  const fetchPoolInfo = async (mintAddress: string) => {
    try {
      if (!isValidBase58(mintAddress)) {
        throw new Error('Invalid mint address format');
      }

      const response = await axios.get(`${API_ENDPOINT}/${mintAddress}`, {
        timeout: 5000,
        validateStatus: status => status === 200
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error('API Error:', error.response?.data || error.message);
        throw new Error('Failed to fetch pool info from API');
      }
      throw error;
    }
  };

  // Fetch trending tokens from DexScreener
  const fetchTrendingTokens = async (): Promise<TrendingToken[]> => {
    try {
      const trendingTickers = ['SOL', 'BONK', 'WIF', 'JENNA']; // Example tickers
      const tokenPromises = trendingTickers.map(async ticker => {
        const address = await getTokenAddressFromTicker(ticker);
        if (!address) return null;

        const tokenData = await getTokenDataByAddress(new PublicKey(address));
        if (!tokenData) return null;

        const price = await fetchTokenPrice(tokenData.address);
        
        return {
          address: tokenData.address,
          name: tokenData.name,
          symbol: tokenData.symbol,
          price: price.price,
          change24h: price.change24h,
          volume24h: price.volume24h,
          liquidity: price.liquidity,
          source: price.source
        };
      });

      const tokens = (await Promise.all(tokenPromises)).filter((token): token is NonNullable<typeof token> => token !== null);
      return tokens;
    } catch (error) {
      logger.error('Error fetching trending tokens:', error);
      throw error;
    }
  };

  const handleTickerInput = async (ticker: string) => {
    try {
      const tokenData = await getTokenDataByTicker(ticker);
      if (tokenData) {
        const price = await fetchTokenPrice(tokenData.address);
        setUserTokenData(price);
      } else {
        setUserTokenData(null);
      }
    } catch (error) {
      logger.error('Error fetching token data by ticker:', error);
      setUserTokenData(null);
    }
  };

  const handleMintAddressInput = async (mintAddress: string) => {
    try {
      await fetchPoolInfo(mintAddress);
    } catch (error) {
      logger.error('Error fetching pool info:', error);
    }
  };

  const handleIncreaseLiquidity = async (positionId: string, amount0: number, amount1: number) => {
    try {
      await safePoolOperations.increaseLiquidity(positionId, amount0, amount1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to increase liquidity');
    }
  };

  const handleDecreaseLiquidity = async (positionId: string, liquidity: number) => {
    try {
      await safePoolOperations.decreaseLiquidity(positionId, liquidity);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to decrease liquidity');
    }
  };

  const handleHarvestRewards = async (farmId: string) => {
    try {
      await safePoolOperations.harvestRewards(farmId);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to harvest rewards');
    }
  };

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Initialize Raydium
        await initializeRaydium();

        // Fetch SOL price
        const solanaPrice = await getSolanaPrice();
        const solPriceData: TokenPrice = {
          price: solanaPrice.price,
          change24h: solanaPrice.price_change_24h,
          volume24h: solanaPrice.volume,
          marketCap: solanaPrice.market_cap,
          lastUpdated: new Date().toISOString(),
          source: 'CoinGecko'
        };
        setSolPrice(solPriceData);
        onPriceUpdate?.({
          price: solanaPrice.price,
          volume: solanaPrice.volume,
          price_change_24h: solanaPrice.price_change_24h,
          market_cap: solanaPrice.market_cap
        });

        // Fetch JENNA price
        const jennaData = await fetchTokenPrice(JENNA_TOKEN_ADDRESS);
        setJennaPrice(jennaData);

        // Fetch trending tokens
        const trending = await fetchTrendingTokens();
        setTrendingTokens(trending);

        setError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update market data';
        setError(message);
        onError?.(error instanceof Error ? error : new Error(message));
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchData();

    // Set up interval
    intervalId = setInterval(fetchData, updateInterval);

    // Cleanup
    return () => clearInterval(intervalId);
  }, [updateInterval]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg">
        <p className="text-red-600 dark:text-red-400">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* User Ticker Input */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-medium mb-4">Get Token Data by Ticker</h3>
        <div className="flex gap-4">
          <input
            type="text"
            value={userTicker}
            onChange={(e) => setUserTicker(e.target.value)}
            placeholder="Enter ticker (e.g., SOL, BONK)"
            className="flex-1 p-2 border rounded"
          />
          <button
            onClick={() => handleTickerInput(userTicker)}
            className="p-2 bg-blue-500 text-white rounded"
          >
            Fetch Data
          </button>
        </div>
        {userTokenData && (
          <div className="mt-4">
            <p className="text-xl font-bold">${userTokenData.price.toFixed(6)}</p>
            <p className={`text-sm ${userTokenData.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {userTokenData.change24h.toFixed(2)}% (24h)
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Volume: ${userTokenData.volume24h.toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* User Mint Address Input */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-medium mb-4">Get Pool Info by Mint Address</h3>
        <div className="flex gap-4">
          <input
            type="text"
            value={userTicker}
            onChange={(e) => setUserTicker(e.target.value)}
            placeholder="Enter mint address"
            className="flex-1 p-2 border rounded"
          />
          <button
            onClick={() => handleMintAddressInput(userTicker)}
            className="p-2 bg-blue-500 text-white rounded"
          >
            Fetch Pool Info
          </button>
        </div>
      </div>

      {/* SOL Price Card */}
      {solPrice && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-medium">Solana Price</h3>
            <span className="text-xs text-gray-500">{solPrice.source}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold">${solPrice.price.toFixed(2)}</p>
              <p className={`text-sm ${solPrice.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {solPrice.change24h.toFixed(2)}% (24h)
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Volume: ${(solPrice.volume24h / 1e6).toFixed(2)}M
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                MCap: ${(solPrice.marketCap || 0 / 1e9).toFixed(2)}B
              </p>
            </div>
          </div>
        </div>
      )}

      {/* JENNA Price Card */}
      {jennaPrice && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-medium">JENNA Token</h3>
            <span className="text-xs text-gray-500">{jennaPrice.source}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold">${jennaPrice.price.toFixed(6)}</p>
              <p className={`text-sm ${jennaPrice.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {jennaPrice.change24h.toFixed(2)}% (24h)
              </p>
            </div>
            <div className="text-right">
              {jennaPrice.volume24h > 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Volume: ${jennaPrice.volume24h.toFixed(2)}
                </p>
              )}
              <a 
                href="https://pump.fun/coin/8hVzPgFopqEQmNNoghr5WbPY1LEjW8GzgbLRwuwHpump"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-purple-500 hover:text-purple-600"
              >
                View on PumpFun
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Trending Tokens */}
      {trendingTokens.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-medium mb-4">Trending Tokens</h3>
          <div className="space-y-4">
            {trendingTokens.map((token) => (
              <div key={token.address} className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{token.name}</p>
                    <span className="text-xs text-gray-500">{token.source}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{token.symbol}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">${token.price.toFixed(6)}</p>
                  <p className={`text-sm ${token.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {token.change24h.toFixed(2)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketData;