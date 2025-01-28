import React, { useEffect, useState } from 'react';
import { MarketAnalysis } from '@/tools/geckoterminal/marketData';
import MarketDataChart from './MarketDataChart';

interface MetricCardProps {
  title: string;
  value: number;
  description: string;
  isPercentage?: boolean;
  colorScale?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  title, 
  value, 
  description, 
  isPercentage = false,
  colorScale = false 
}) => {
  const getColorClass = () => {
    if (!colorScale) return 'text-white';
    if (value >= 70) return 'text-green-400';
    if (value >= 30) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-gray-700 rounded-lg p-4">
      <h3 className="text-gray-400 text-sm mb-1">{title}</h3>
      <p className={`text-2xl font-bold ${getColorClass()}`}>
        {isPercentage ? `${value.toFixed(1)}%` : value.toFixed(2)}
      </p>
      <p className="text-gray-400 text-xs mt-1">{description}</p>
    </div>
  );
};

interface TokenAnalysisProps {
  analysis: MarketAnalysis;
  className?: string;
}

const TokenAnalysis: React.FC<TokenAnalysisProps> = ({ analysis, className = '' }) => {
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Price Chart */}
      <MarketDataChart 
        tokenData={analysis.token}
        priceHistory={analysis.priceHistory}
        period="24h"
      />

      {/* Market Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Volatility Score"
          value={analysis.marketMetrics.volatility * 100}
          description="Measure of price fluctuation"
          isPercentage
          colorScale
        />
        <MetricCard
          title="Volume Rank"
          value={analysis.marketMetrics.volumeRank}
          description="Trading volume percentile"
          isPercentage
          colorScale
        />
        <MetricCard
          title="Liquidity Score"
          value={analysis.marketMetrics.liquidityScore}
          description="Market depth assessment"
          isPercentage
          colorScale
        />
        <MetricCard
          title="Price Score"
          value={analysis.marketMetrics.priceScore}
          description="Price trend analysis"
          isPercentage
          colorScale
        />
      </div>

      {/* Top Pools */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-white text-lg font-bold mb-4">Top Liquidity Pools</h3>
        <div className="space-y-4">
          {analysis.topPools.map((pool) => (
            <div key={pool.address} className="bg-gray-700 rounded p-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-white font-medium">{pool.name}</p>
                  <p className="text-gray-400 text-sm">{pool.dex}</p>
                </div>
                <div className="text-right">
                  <p className="text-white">
                    ${pool.liquidity_usd.toLocaleString()}
                  </p>
                  <p className="text-gray-400 text-sm">
                    24h Vol: ${pool.volume_24h.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TokenAnalysis;
