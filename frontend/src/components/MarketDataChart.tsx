import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { OHLCVData, TokenData } from '@/tools/geckoterminal';

interface MarketDataChartProps {
  tokenData: TokenData;
  priceHistory: OHLCVData[];
  period: '24h' | '7d' | '30d';  // Can be expanded
}

const MarketDataChart: React.FC<MarketDataChartProps> = ({
  tokenData,
  priceHistory,
  period
}) => {
  // Format data for chart
  const chartData = priceHistory.map(candle => ({
    time: new Date(candle.timestamp).toLocaleString(),
    price: candle.close,
    volume: candle.volume
  }));

  return (
    <div className="w-full bg-gray-800 rounded-lg p-4">
      <div className="mb-4">
        <h3 className="text-xl text-white font-bold">{tokenData.name} ({tokenData.symbol})</h3>
        <div className="grid grid-cols-3 gap-4 mt-2">
          <div className="bg-gray-700 p-2 rounded">
            <p className="text-gray-400 text-sm">Price</p>
            <p className="text-white font-bold">${tokenData.price_usd.toFixed(6)}</p>
          </div>
          <div className="bg-gray-700 p-2 rounded">
            <p className="text-gray-400 text-sm">24h Change</p>
            <p className={`font-bold ${tokenData.price_change_24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {tokenData.price_change_24h.toFixed(2)}%
            </p>
          </div>
          <div className="bg-gray-700 p-2 rounded">
            <p className="text-gray-400 text-sm">24h Volume</p>
            <p className="text-white font-bold">${(tokenData.volume_24h / 1000000).toFixed(2)}M</p>
          </div>
        </div>
      </div>

      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="time" 
              stroke="#9CA3AF"
              tick={{ fill: '#9CA3AF' }}
            />
            <YAxis 
              yAxisId="left"
              stroke="#9CA3AF"
              tick={{ fill: '#9CA3AF' }}
              domain={['auto', 'auto']}
              tickFormatter={(value) => `$${value.toFixed(6)}`}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              stroke="#9CA3AF"
              tick={{ fill: '#9CA3AF' }}
              domain={['auto', 'auto']}
              tickFormatter={(value) => `$${(value/1000000).toFixed(2)}M`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                borderColor: '#374151',
                color: '#fff'
              }}
              labelStyle={{ color: '#9CA3AF' }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="price"
              stroke="#8B5CF6"
              dot={false}
              strokeWidth={2}
              name="Price"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="volume"
              stroke="#10B981"
              dot={false}
              strokeWidth={2}
              name="Volume"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MarketDataChart;
