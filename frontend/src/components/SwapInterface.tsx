import { useState, useEffect } from 'react';
import logger from '@/utils/logger';
import { swap } from '@/app/api/raydium/amm/swap';
import { fetchRpcPoolInfo } from '@/app/api/raydium/amm/fetchRpcPoolInfo';
import { routeSwap } from '@/app/api/raydium/trade/routeSwap';
import { createQuoteService, QuoteResult } from '@/app/api/raydium/services/quote';
import { createPriceService, TokenPriceInfo } from '@/app/api/raydium/services/price';
import {  PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  AmmPool, AmmSwap, ClmmPool, ClmmSwap,
  FarmStake, ClmmNewPosition, ClmmIncrease,
  ClmmDecrease, ClmmHarvest
} from '@/app/api/raydium';
import { useConnection } from '@solana/wallet-adapter-react';
import Chart from '@/components/Chart';



interface Token {
  address: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

interface Route {
  ammId: string;
  marketId: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpact: number;
}

interface SwapInterfaceProps {
  tokens: Token[];
  onSwap: (params: {
    inputToken: Token;
    outputToken: Token;
    amount: string;
    slippage: number;
  }) => Promise<string>;
  loading?: boolean;
  error?: string | null;
  visible: boolean;
  onClose: () => void;
  initialTokens?: {
    from: string;
    to: string;
    amount?: number;
  };
}

interface Transaction {
  signature: string;
  status: 'pending' | 'confirmed' | 'failed';
  type: 'swap' | 'position' | 'farm';
  timestamp: number;
}

interface PriceData {
  timestamp: number;
  price: number;
  volume: number;
  marketCap: number;
}

export default function SwapInterface({
  tokens,
  onSwap,
  loading = false,
  error = null,
  visible,
  onClose,
  initialTokens
}: SwapInterfaceProps) {
  const [inputToken, setInputToken] = useState<Token | null>(
    initialTokens ? tokens.find(t => t.address === initialTokens.from) || null : null
  );
  const [outputToken, setOutputToken] = useState<Token | null>(
    initialTokens ? tokens.find(t => t.address === initialTokens.to) || null : null
  );
  const [inputAmount, setInputAmount] = useState(
    initialTokens && initialTokens.amount ? initialTokens.amount.toString() : ''
  );
  const [outputAmount, setOutputAmount] = useState('');
  const [slippage, setSlippage] = useState(1.0);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [route, setRoute] = useState<Route>();
  const [priceImpact, setPriceImpact] = useState<number>(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [tokenPrice, setTokenPrice] = useState<TokenPriceInfo | null>(null);
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [poolType, setPoolType] = useState<'AMM' | 'CLMM'>('AMM');
  const [position, setPosition] = useState<any>(null);
  const [farmEnabled, setFarmEnabled] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceData[]>([]);
  const [gasFee, setGasFee] = useState<number>(0);
  const [priceImpactLevel, setPriceImpactLevel] = useState<string>('');
  const { connection } = useConnection();
  const [swapError, setSwapError] = useState<string | null>(null);

  const priceService = createPriceService(connection);
  const quoteService = createQuoteService(connection);

  const validateTokenPair = async () => {
    if (!inputToken || !outputToken) {
      logger.error('Invalid token pair');
      return false;
    }
    return true;
  };

  const findBestRoute = async () => {
    const isValid = await validateTokenPair();
    if (!isValid) return;

    setStatus('loading');
    try {
      const result = await routeSwap();
      const routes = result === undefined ? [] : result;
      const routeArray = Array.isArray(routes) ? routes : [];
      
      if (routeArray.length > 0) {
        const bestRoute = routeArray[0] as Route;
        setRoute(bestRoute);
        setPriceImpact(bestRoute.priceImpact);
      }
    } catch (error) {
      logger.error('Route finding error:', error);
    }
    setStatus('idle');
  };

  const getSwapQuote = async () => {
    if (!await validateTokenPair() || !inputAmount || Number(inputAmount) <= 0 || !inputToken || !outputToken) {
      setOutputAmount('');
      return;
    }

    setQuoteLoading(true);
    try {
      const quote = await quoteService.getQuote({
        inputMint: new PublicKey(inputToken.address),
        outputMint: new PublicKey(outputToken.address),
        amount: new BN(inputAmount),
        slippage
      });

      setQuoteResult(quote);
      setOutputAmount(quote.outputAmount.toString());
    } catch (error) {
      logger.error('Error getting quote:', error);
      setOutputAmount('');
    } finally {
      setQuoteLoading(false);
    }
  };

  const executeSwap = async () => {
    if (!route) return;

    setStatus('loading');
    try {
      const impact = await calculatePriceImpact(route);
      if (impact === 'High Impact' && !window.confirm('High price impact! Continue?')) {
        return;
      }

      const fee = await estimateGasFees(route);
      
      const tx = poolType === 'AMM' 
        ? await AmmSwap.swap()
        : await swap();

      if (tx) {
        await trackTransaction(tx, 'swap');
        
        setStatus('success');
        setInputAmount('');
        setOutputAmount('');
        setSwapError(null);
      }
    } catch (error) {
      handleSwapError(error);
    }
  };

  const fetchTokenPrice = async (mint: PublicKey) => {
    try {
      const priceInfo = await priceService.getTokenPrice(mint);
      setTokenPrice(priceInfo);
    } catch (error) {
      logger.error('Error fetching token price:', error);
    }
  };

  const createPool = async () => {
    if (poolType === 'AMM') {
      await AmmPool.createAmmPool();
    } else {
      if (inputToken && outputToken) {
        await ClmmPool.createPool();
      } else {
        logger.error('Invalid token pair for creating pool');
      }
    }
  };

  const handleCreatePosition = async () => {
    const pos = await ClmmNewPosition.createPosition();
    setPosition(pos);
  };

  const handleIncreasePosition = async () => {
    await ClmmIncrease.increaseLiquidity();
  };

  const handleDecreasePosition = async () => {
    await ClmmDecrease.decreaseLiquidity();
  };

  const handleStake = async () => {
    if (farmEnabled) {
      await FarmStake.stake();
    }
  };

  const handleHarvest = async () => {
    await ClmmHarvest.harvestAllRewards();
  };

  const calculatePriceImpact = async (route: Route) => {
    try {
      await setPriceImpact(route.priceImpact); // Ensure setPriceImpact is called correctly
      const impactLevel = route.priceImpact > 1 ? 'High Impact' : 'Low Impact';
      setPriceImpactLevel(impactLevel);
      return impactLevel;
    } catch (error) {
      logger.error('Price impact calculation failed:', error);
      return 'Unknown Impact';
    }
  };

  const trackTransaction = async (tx: any, type: Transaction['type']) => {
    const newTx: Transaction = {
      signature: tx.signature,
      status: 'pending',
      type,
      timestamp: Date.now()
    };
    
    setTransactions(prev => [newTx, ...prev]);

    try {
      await connection.confirmTransaction(tx.signature);
      setTransactions(prev => 
        prev.map(t => 
          t.signature === tx.signature 
            ? {...t, status: 'confirmed'}
            : t
        )
      );
    } catch (error) {
      setTransactions(prev =>
        prev.map(t =>
          t.signature === tx.signature
            ? {...t, status: 'failed'}
            : t
        )
      );
      handleSwapError(error);
    }
  };

  const estimateGasFees = async (route: Route): Promise<number> => {
    try {
      // Example gas fee calculation - replace with actual implementation
      const priorityFee = 0.000005; // Default fee in SOL
      setGasFee(priorityFee);
      return priorityFee;
    } catch (error) {
      logger.error('Fee estimation failed:', error);
      return 0;
    }
  };

  const handleSwapError = (error: any) => {
    if (error.code === 6000) {
      setSwapError('Insufficient funds for swap');
    } else if (error.code === 6001) {
      setSwapError('Price moved beyond slippage tolerance');
    } else if (error.code === 6002) {
      setSwapError('Pool has insufficient liquidity');
    } else {
      setSwapError('Swap failed - please try again');
    }
    setStatus('error');
  };

  const usePriceData = (inputToken: Token | null, outputToken: Token | null) => {
    const [prices, setPrices] = useState<PriceData[]>([]);
  
    useEffect(() => {
      const fetchPriceHistory = async () => {
        if (!inputToken || !outputToken) {
          setPrices([]);
          return;
        }
  
        const history: PriceData[] = Array.from({length: 24}, (_, i) => ({
          timestamp: Date.now() - i * 3600000,
          price: Math.random() * 100,
          volume: Math.random() * 1000000,
          marketCap: Math.random() * 10000000
        }));
        
        setPrices(history);
      };
  
      fetchPriceHistory();
      const interval = setInterval(fetchPriceHistory, 15000);
      return () => clearInterval(interval);
    }, [inputToken, outputToken]);
  
    return prices;
  };
  
  // Replace the conditional hook call with direct usage
  const prices = usePriceData(inputToken, outputToken);

  const fetchPoolInfo = async () => {
    try {
      await fetchRpcPoolInfo(); // Use the fetchRpcPoolInfo function
    } catch (error) {
      logger.error('Error fetching pool info:', error);
    }
  };

  // Get quote when input changes
  useEffect(() => {
    getSwapQuote();
  }, [inputToken, outputToken, inputAmount, slippage]);

  // Fetch token price when input token changes
  useEffect(() => {
    if (inputToken) {
      fetchTokenPrice(new PublicKey(inputToken.address));
    }
  }, [inputToken]);

  // Fetch pool info on component mount
  useEffect(() => {
    fetchPoolInfo();
  }, []);

  if (!visible) return null;

  const RouteDisplay = () => {
    if (!route) return null;
    
    return (
      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div className="flex justify-between text-sm">
          <span>Route</span>
          <span>{route.ammId}</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span>Price Impact</span>
          <span className={priceImpact > 1 ? 'text-red-500' : 'text-green-500'}>
            {priceImpact.toFixed(2)}%
          </span>
        </div>
      </div>
    );
  };

  const TokenPriceDisplay = () => {
    if (!tokenPrice) return null;

    return (
      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div className="flex justify-between text-sm">
          <span>Price</span>
          <span>{tokenPrice.price}</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span>24h Volume</span>
          <span>{tokenPrice.volume24h}</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span>24h Price Change</span>
          <span>{tokenPrice.priceChange24h}%</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span>Liquidity</span>
          <span>{tokenPrice.liquidity}</span>
        </div>
      </div>
    );
  };

  const QuoteDisplay = () => {
    if (!quoteResult) return null;

    return (
      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div className="flex justify-between text-sm">
          <span>Input Amount</span>
          <span>{quoteResult.inputAmount.toString()}</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span>Output Amount</span>
          <span>{quoteResult.outputAmount.toString()}</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span>Price Impact</span>
          <span>{quoteResult.priceImpact.toFixed(2)}%</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span>Fee</span>
          <span>{quoteResult.fee.toFixed(2)}</span>
        </div>
      </div>
    );
  };

  const PriceChart = () => {
    if (!inputToken || !outputToken) return null; // Add null checks

    return (
      <div className="h-48 mt-4">
        <Chart
          chartConfig={{
            type: 'line',
            timeframe: '24h',
            metric: 'price',
            data: prices
          }}
        />
      </div>
    );
  };

  const TransactionList = () => (
    <div className="mt-4 space-y-2">
      {transactions.map(tx => (
        <div key={tx.signature} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
          <div>
            <div className="text-sm font-medium">{tx.type}</div>
            <div className="text-xs text-gray-500">{tx.signature.slice(0,8)}...</div>
          </div>
          <div className={`text-sm ${
            tx.status === 'confirmed' ? 'text-green-500' :
            tx.status === 'failed' ? 'text-red-500' :
            'text-yellow-500'
          }`}>
            {tx.status}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="modal">
      <button onClick={onClose}>Close</button>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-medium mb-4">Swap Tokens</h3>

        {swapError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Input Token */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              From
            </label>
            <div className="flex gap-2">
              <select
                value={inputToken?.address || ''}
                onChange={(e) => {
                  const token = tokens.find(t => t.address === e.target.value);
                  setInputToken(token || null);
                }}
                className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="">Select token</option>
                {tokens.map((token) => (
                  <option key={token.address} value={token.address}>
                    {token.symbol}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          </div>

          {/* Swap Direction */}
          <button
            onClick={() => {
              const temp = inputToken;
              setInputToken(outputToken);
              setOutputToken(temp);
              setInputAmount(outputAmount);
              setOutputAmount(inputAmount);
            }}
            className="mx-auto block p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>

          {/* Output Token */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              To
            </label>
            <div className="flex gap-2">
              <select
                value={outputToken?.address || ''}
                onChange={(e) => {
                  const token = tokens.find(t => t.address === e.target.value);
                  setOutputToken(token || null);
                }}
                className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="">Select token</option>
                {tokens.map((token) => (
                  <option key={token.address} value={token.address}>
                    {token.symbol}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={outputAmount}
                readOnly
                placeholder={quoteLoading ? 'Loading...' : '0.00'}
                className="flex-1 p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          </div>

          <RouteDisplay />
          <TokenPriceDisplay />
          <QuoteDisplay />

          {/* Slippage Setting */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Slippage Tolerance
            </label>
            <div className="flex gap-2">
              {[0.5, 1.0, 2.0].map((value) => (
                <button
                  key={value}
                  onClick={() => setSlippage(value)}
                  className={`px-3 py-1 rounded-lg ${
                    slippage === value
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {value}%
                </button>
              ))}
              <input
                type="number"
                value={slippage}
                onChange={(e) => setSlippage(Number(e.target.value))}
                className="w-20 p-1 border rounded-lg text-center dark:bg-gray-700 dark:border-gray-600"
                min="0.1"
                max="50"
                step="0.1"
              />
            </div>
          </div>

          {/* Swap Button */}
          <button
            onClick={executeSwap}
            disabled={loading || !inputToken || !outputToken || !inputAmount || Number(inputAmount) <= 0}
            className="w-full py-3 bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-600 transition-colors duration-200"
          >
            {loading ? 'Swapping...' : 'Swap'}
          </button>

          <div className="mt-4 space-y-2">
            <select onChange={e => setPoolType(e.target.value as 'AMM' | 'CLMM')}>
              <option value="AMM">AMM Pool</option>
              <option value="CLMM">CLMM Pool</option>
            </select>

            <button onClick={createPool}>Create Pool</button>

            {poolType === 'CLMM' && (
              <div className="space-y-2">
                <button onClick={handleCreatePosition}>Create Position</button>
                <button onClick={handleIncreasePosition}>Increase Position</button>
                <button onClick={handleDecreasePosition}>Decrease Position</button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input 
                type="checkbox"
                checked={farmEnabled}
                onChange={e => setFarmEnabled(e.target.checked)}
              />
              <label>Enable Farming</label>
            </div>

            {farmEnabled && (
              <div className="space-y-2">
                <button onClick={handleStake}>Stake</button>
                <button onClick={handleHarvest}>Harvest Rewards</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}