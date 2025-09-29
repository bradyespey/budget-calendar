//src/components/SavingsChart.tsx

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'

interface SavingsChartProps {
  data: Array<{ balance: number; timestamp: Date }>
}

export function SavingsChart({ data }: SavingsChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400">
        <p>No savings history yet. Start tracking by updating balances.</p>
      </div>
    )
  }

  // Format data for recharts
  const chartData = data.map(item => ({
    date: format(item.timestamp, 'MMM d'),
    fullDate: format(item.timestamp, 'MMM d, h:mm a'),
    balance: item.balance
  }))

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
        />
        <YAxis 
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
          tickFormatter={formatCurrency}
        />
        <Tooltip 
          formatter={(value: number) => [formatCurrency(value), 'Balance']}
          labelFormatter={(label) => {
            const item = chartData.find(d => d.date === label)
            return item?.fullDate || label
          }}
          contentStyle={{ 
            backgroundColor: '#1f2937', 
            border: '1px solid #374151',
            borderRadius: '8px',
            color: '#f9fafb'
          }}
        />
        <Line 
          type="monotone" 
          dataKey="balance" 
          stroke="#10b981" 
          strokeWidth={2}
          dot={{ fill: '#10b981', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
