import React, { memo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useTranslation } from 'next-i18next';

interface XAUtDataPoint {
  timestamp: string;
  amount: number;
}

interface XAUtChartProps {
  data: XAUtDataPoint[];
}

const XAUtChart = memo(function XAUtChart({ data }: XAUtChartProps) {
  const { t } = useTranslation('common');

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        {t('no_data_yet') || 'No data available yet'}
      </div>
    );
  }

  // Format data for chart
  const chartData = data.map((point) => ({
    date: new Date(point.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: parseFloat(point.amount.toFixed(6)),
    fullDate: new Date(point.timestamp).toLocaleString(),
  }));

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-dark rounded-lg p-3 border border-white/10">
          <p className="text-sm text-gray-300 mb-1">{payload[0].payload.fullDate}</p>
          <p className="text-lg font-bold text-gold-900">
            {payload[0].value.toFixed(6)} XAUt
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-64 lg:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="xautGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FFD700" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#FFD700" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
          <XAxis 
            dataKey="date" 
            stroke="rgba(255, 255, 255, 0.5)"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="rgba(255, 255, 255, 0.5)"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => value.toFixed(4)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#FFD700"
            strokeWidth={2}
            fill="url(#xautGradient)"
            dot={{ fill: '#FFD700', r: 4 }}
            activeDot={{ r: 6, fill: '#FFD700' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

export default XAUtChart;

