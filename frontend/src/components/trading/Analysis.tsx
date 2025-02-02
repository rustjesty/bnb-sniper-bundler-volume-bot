import { useState, useEffect } from 'react';
import parseTransaction from '@/tools/helius/helius_transaction_parsing';
import { ScoringWalletKit } from '@/utils/scoringWallet';
import { PublicKey } from '@solana/web3.js';
import { SolanaAgentKit } from 'solana-agent-kit/dist/agent';
import type ChartConfig from '../Chart';
// Import our safe utilities
import { safePublicKey, isValidBase58 } from '@/utils/base58';
import logger from '@/utils/logger';

interface AnalysisScore {
  category: string; 
  score: number;
  description: string;
}

interface WalletMetrics {
  transactionCount: number;
  uniqueDexes: number;
  tradingVolume: number;
  profitability: number;
  avgTransactionSize: number;
}
 
interface TransactionType {
  type: string;
  count: number;
  volume: number;
}

interface AnalysisProps {
  walletAddress?: string;
  onError?: (error: Error) => void;
  updateChartConfig: (config: Partial<ChartConfig>) => void;
  selectedToken: string;
  onTokenSelect: (token: string) => void;
  chartConfig: ChartConfig;
}

interface ChartData {
  name: string;
  uv: number;
  pv: number;
  amt: number;
}

export interface ChartConfig {
  type: 'line' | 'area' | 'bar';
  timeframe: '24h' | '7d' | '30d' | '1y';
  metric: 'price' | 'volume' | 'marketCap';
  data: Array<{
    timestamp: number;
    price: number;
    volume: number;
    marketCap: number;
  }>;
}

const Analysis: React.FC<AnalysisProps> = ({
  walletAddress,
  onError,
  updateChartConfig,
  selectedToken,
  onTokenSelect,
  chartConfig
}) => {
  const [scores, setScores] = useState<AnalysisScore[]>([]);
  const [metrics, setMetrics] = useState<WalletMetrics | null>(null);
  const [transactionTypes, setTransactionTypes] = useState<TransactionType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (walletAddress) {
      analyzeWallet();
    }
  }, [walletAddress]);

  const analyzeWallet = async () => {
    if (!walletAddress) return;

    setIsLoading(true);
    setError(null);

    try {
      // Validate wallet address
      if (!isValidBase58(walletAddress)) {
        throw new Error('Invalid wallet address format');
      }

      // Safely create PublicKey
      const publicKey = safePublicKey(walletAddress);
      if (!publicKey) {
        throw new Error('Invalid wallet address');
      }

      // Initialize ScoringWalletKit with validated address
      try {
        await ScoringWalletKit.fetchTx(publicKey, 1000);
      } catch (error) {
        logger.error('ScoringWalletKit error:', error);
        throw new Error('Failed to fetch wallet transactions');
      }

      // Get scores with error handling
      const analysisScores: AnalysisScore[] = await getSafeScores();
      setScores(analysisScores);

      // Parse transactions safely
      const agent = await createSafeAgent();
      if (!agent) {
        throw new Error('Failed to initialize agent');
      }

      const txs = await parseTransaction(agent, walletAddress);
      
      // Calculate metrics with validation
      const metrics = calculateSafeMetrics(txs);
      setMetrics(metrics);

      // Calculate transaction types safely
      const types = calculateSafeTransactionTypes(txs);
      setTransactionTypes(types);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed';
      setError(message);
      onError?.(error instanceof Error ? error : new Error(message));
    } finally {
      setIsLoading(false);
    }
  };

  // Safe helper functions
  const getSafeScores = async (): Promise<AnalysisScore[]> => {
    try {
      return [
        {
          category: 'Transaction Frequency',
          score: ScoringWalletKit.calcTxFreq() || 0,
          description: 'Measures trading activity frequency'
        },
        {
          category: 'Volume',
          score: ScoringWalletKit.calcVol() || 0,
          description: 'Trading volume score'
        },
        {
          category: 'Profitability',
          score: ScoringWalletKit.calcProfitability() || 0,
          description: 'Success rate of trades'
        },
        {
          category: 'DEX Diversity',
          score: ScoringWalletKit.calcDexDiversity() || 0,
          description: 'Usage of different DEXes'
        },
        {
          category: 'Risk Profile',
          score: ScoringWalletKit.calcRiskContract() || 0,
          description: 'Risk assessment based on trading patterns'
        },
        {
          category: 'Final Score',
          score: ScoringWalletKit.calcFinalScore() || 0,
          description: 'Overall performance score'
        }
      ];
    } catch (error) {
      logger.error('Error calculating scores:', error);
      return [];
    }
  };

  const createSafeAgent = async () => {
    try {
      const privateKey = process.env.SOLANA_PRIVATE_KEY;
      const rpcUrl = process.env.SOLANA_RPC_URL;
      const openaiApiKey = process.env.OPENAI_API_KEY;

      if (!privateKey || !rpcUrl || !openaiApiKey) {
        throw new Error('Missing required environment variables');
      }

      if (!isValidBase58(privateKey)) {
        throw new Error('Invalid private key format');
      }

      return new SolanaAgentKit(privateKey, rpcUrl, openaiApiKey);
    } catch (error) {
      logger.error('Error creating agent:', error);
      return null;
    }
  };

  const calculateSafeMetrics = (txs: any[]): WalletMetrics => {
    try {
      return {
        transactionCount: txs.length,
        uniqueDexes: new Set(txs.map(tx => tx.dex).filter(Boolean)).size,
        tradingVolume: txs.reduce((sum, tx) => sum + (Number(tx.volume) || 0), 0),
        profitability: txs.filter(tx => Number(tx.profit) > 0).length / txs.length * 100,
        avgTransactionSize: txs.length ? 
          txs.reduce((sum, tx) => sum + (Number(tx.volume) || 0), 0) / txs.length : 
          0
      };
    } catch (error) {
      logger.error('Error calculating metrics:', error);
      return {
        transactionCount: 0,
        uniqueDexes: 0,
        tradingVolume: 0,
        profitability: 0,
        avgTransactionSize: 0
      };
    }
  };

  const calculateSafeTransactionTypes = (txs: any[]): TransactionType[] => {
    try {
      const typeMap = new Map<string, TransactionType>();
      
      txs.forEach(tx => {
        const type = tx.type || 'unknown';
        const existing = typeMap.get(type) || { type, count: 0, volume: 0 };
        
        typeMap.set(type, {
          ...existing,
          count: existing.count + 1,
          volume: existing.volume + (Number(tx.volume) || 0)
        });
      });

      return Array.from(typeMap.values());
    } catch (error) {
      logger.error('Error calculating transaction types:', error);
      return [];
    }
  };

  const handleButtonClick = () => {
    const newConfig: Partial<ChartConfig> = {
      type: 'bar',
      data: chartConfig.data // Keep the existing data
    };
    updateChartConfig(newConfig);
  };

  if (!walletAddress) {
    return (
      <div className="text-center text-gray-600 dark:text-gray-400">
        Connect wallet to view analysis
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Score Overview */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-medium mb-4">Wallet Analysis</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {scores.map((score) => (
            <div key={score.category} className="p-4 border rounded-lg dark:border-gray-700">
              <h4 className="text-sm text-gray-600 dark:text-gray-400">
                {score.category}
              </h4>
              <p className="text-2xl font-bold">{score.score.toFixed(2)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {score.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Trading Metrics */}
      {metrics && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-4">Trading Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <h4 className="text-sm text-gray-600 dark:text-gray-400">Transactions</h4>
              <p className="text-2xl font-bold">{metrics.transactionCount}</p>
            </div>
            <div>
              <h4 className="text-sm text-gray-600 dark:text-gray-400">DEXes Used</h4>
              <p className="text-2xl font-bold">{metrics.uniqueDexes}</p>
            </div>
            <div>
              <h4 className="text-sm text-gray-600 dark:text-gray-400">Volume</h4>
              <p className="text-2xl font-bold">${metrics.tradingVolume.toFixed(2)}</p>
            </div>
            <div>
              <h4 className="text-sm text-gray-600 dark:text-gray-400">Success Rate</h4>
              <p className="text-2xl font-bold">{metrics.profitability.toFixed(1)}%</p>
            </div>
            <div>
              <h4 className="text-sm text-gray-600 dark:text-gray-400">Avg Tx Size</h4>
              <p className="text-2xl font-bold">${metrics.avgTransactionSize.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Types */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-medium mb-4">Transaction Types</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {transactionTypes.map((type) => (
            <div key={type.type} className="p-4 border rounded-lg dark:border-gray-700">
              <h4 className="text-sm text-gray-600 dark:text-gray-400">{type.type}</h4>
              <p className="text-2xl font-bold">{type.count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Volume: ${type.volume.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <button onClick={handleButtonClick}>Update Chart</button>
      </div>
    </div>
  );
};

export default Analysis;