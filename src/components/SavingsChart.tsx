//src/components/SavingsChart.tsx

import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'

interface SavingsChartProps {
  data: Array<{ balance: number; timestamp: Date }>
}

export function SavingsChart({ data }: SavingsChartProps) {
  const chartTheme =
    typeof window === 'undefined'
      ? {
          grid: '#cbd5e1',
          line: '#2c8b6d',
          text: '#64748b',
          tooltipBg: '#0f172a',
          tooltipBorder: '#334155',
        }
      : (() => {
          const styles = getComputedStyle(document.documentElement)
          return {
            grid: styles.getPropertyValue('--line-strong').trim() || '#cbd5e1',
            line: styles.getPropertyValue('--success').trim() || '#2c8b6d',
            text: styles.getPropertyValue('--muted').trim() || '#64748b',
            tooltipBg: styles.getPropertyValue('--surface-elevated').trim() || '#0f172a',
            tooltipBorder: styles.getPropertyValue('--line-strong').trim() || '#334155',
          }
        })()

  // Memoize chart data to prevent re-renders
  const chartData = useMemo(() => {
    if (data.length === 0) return [];
    
    return data.map(item => ({
      date: format(item.timestamp, 'MMM d'),
      fullDate: format(item.timestamp, 'MMM d, h:mm a'),
      balance: item.balance
    }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400">
        <p>No savings history yet. Start tracking by updating balances.</p>
      </div>
    )
  }

  // Memoize formatters to prevent re-creating on every render
  const formatCurrency = useMemo(() => 
    (value: number) => new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value),
    []
  );

  const labelFormatter = useMemo(() => 
    (label: string) => {
      const item = chartData.find(d => d.date === label);
      return item?.fullDate || label;
    },
    [chartData]
  );

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} opacity={0.7} />
        <XAxis 
          dataKey="date" 
          stroke={chartTheme.text}
          style={{ fontSize: '12px' }}
        />
        <YAxis 
          stroke={chartTheme.text}
          style={{ fontSize: '12px' }}
          tickFormatter={formatCurrency}
        />
        <Tooltip 
          formatter={(value: number) => [formatCurrency(value), 'Balance']}
          labelFormatter={labelFormatter}
          contentStyle={{ 
            backgroundColor: chartTheme.tooltipBg,
            border: `1px solid ${chartTheme.tooltipBorder}`,
            borderRadius: '18px',
            color: 'var(--text)',
            boxShadow: 'var(--shadow-crisp)'
          }}
        />
        <Line 
          type="monotone" 
          dataKey="balance" 
          stroke={chartTheme.line}
          strokeWidth={3}
          dot={{ fill: chartTheme.line, r: 4 }}
          activeDot={{ r: 6 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
