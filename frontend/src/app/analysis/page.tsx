'use client';

import { useState, useEffect } from 'react';
import Analysis from '@/components/Analysis';  
import Chart from '@/components/Chart';
import MarketData from '@/components/MarketData';
import type { ChartConfig, TimeFrame } from '@/types/market';
import logger from '@/utils/logger';
import bs58 from 'bs58';

// Validation helper
const isValidTokenAddress = (address: string): boolean => {
  try {
    if (address === 'SOL') return true;
    return bs58.decode(address).length === 32;
  } catch {
    return false;
  }
};

export default function AnalysisPage() {
  // States
  const [chartConfig, setChartConfig] = useState<ChartConfig>({
    type: 'line',
    timeframe: '24h',
    metric: 'price',
    data: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<string>('SOL');

  // Fetch market data
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Validate token address
        if (selectedToken !== 'SOL' && !isValidTokenAddress(selectedToken)) {
          throw new Error('Invalid token address');
        }

        const params = new URLSearchParams({
          timeframe: chartConfig.timeframe,
          metric: chartConfig.metric
        });

        const response = await fetch(`/api/market-data/${selectedToken}?${params}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to fetch market data');
        }

        const data = await response.json();

        // Data validation
        if (!Array.isArray(data)) {
          throw new Error('Invalid data format received');
        }

        // Transform with validation
        const transformedData = data.map((item: any) => {
          if (!item.timestamp || isNaN(item.price)) {
            logger.warn('Invalid data point:', item);
            return null;
          }
          
          return {
            timestamp: item.timestamp,
            price: parseFloat(item.price) || 0,
            volume: parseFloat(item.volume) || 0,
            marketCap: parseFloat(item.marketCap) || 0
          };
        }).filter((item): item is ChartConfig['data'][number] => item !== null); // Remove invalid entries

        setChartConfig(prev => ({
          ...prev,
          data: transformedData
        }));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
        setError(errorMessage);
        logger.error('Market data error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarketData();
  }, [selectedToken, chartConfig.timeframe, chartConfig.metric]);

  const updateChartConfig = (updates: Partial<ChartConfig>) => {
    setChartConfig(prev => ({
      ...prev,
      ...updates
    }));
  };

  const handleTokenSelect = (token: string) => {
    if (token !== 'SOL' && !isValidTokenAddress(token)) {
      setError('Invalid token address selected');
      return;
    }
    setError(null);
    setSelectedToken(token);
  };

  const timeframes: TimeFrame[] = ['24h', '7d', '30d', '1y'];

  // Improved error display component
  const ErrorDisplay = ({ message }: { message: string }) => (
    <div className="flex items-center space-x-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 
                    text-red-600 dark:text-red-400 rounded-lg">
      <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" 
           strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
        <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{message}</span>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Market Analysis</h1>
        {error && <ErrorDisplay message={error} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <Analysis 
            updateChartConfig={updateChartConfig}
            selectedToken={selectedToken}
            onTokenSelect={handleTokenSelect}
            chartConfig={chartConfig}
          />
        </div>
        
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-semibold">{selectedToken} Chart</h2>
                {isLoading && (
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent 
                                rounded-full animate-spin" />
                )}
              </div>
              
              <div className="flex space-x-2">
                {timeframes.map((timeframe) => (
                  <button
                    key={timeframe}
                    onClick={() => updateChartConfig({ timeframe })}
                    className={`px-3 py-1 rounded transition-colors duration-200 ${
                      chartConfig.timeframe === timeframe
                        ? 'bg-purple-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {timeframe}
                  </button>
                ))}
              </div>
            </div>
            
            <Chart 
              chartConfig={chartConfig}
              isLoading={isLoading}
            />
          </div>
          
          <MarketData 
            token={selectedToken}
            metric={chartConfig.metric}
          />
        </div>
      </div>
    </div>
  );
}