//src/components/ProjectedBalanceChart.tsx

import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { Projection } from '../types'

interface ProjectedBalanceChartProps {
  data: Projection[]
}

export function ProjectedBalanceChart({ data }: ProjectedBalanceChartProps) {
  const chartTheme =
    typeof window === 'undefined'
      ? {
          grid: '#cbd5e1',
          line: '#2563eb',
          text: '#64748b',
          tooltipBg: '#0f172a',
          tooltipBorder: '#334155',
        }
      : (() => {
          const styles = getComputedStyle(document.documentElement)
          return {
            grid: styles.getPropertyValue('--line-strong').trim() || '#cbd5e1',
            line: styles.getPropertyValue('--accent').trim() || '#2563eb',
            text: styles.getPropertyValue('--muted').trim() || '#64748b',
            tooltipBg: styles.getPropertyValue('--surface-elevated').trim() || '#0f172a',
            tooltipBorder: styles.getPropertyValue('--line-strong').trim() || '#334155',
          }
        })()

  const formatCurrency = useMemo(
    () => (value: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value),
    []
  )

  const chartData = useMemo(() => {
    return data
      .slice(0, 180)
      .map(item => ({
        date: format(parseISO(item.proj_date), 'MMM d'),
        fullDate: format(parseISO(item.proj_date), 'EEEE, MMM d, yyyy'),
        balance: Math.round(item.projected_balance),
        isLowest: item.lowest,
        isHighest: item.highest,
      }))
  }, [data])

  const labelFormatter = useMemo(
    () => (label: string) => {
      const item = chartData.find(point => point.date === label)
      return item?.fullDate || label
    },
    [chartData]
  )

  if (chartData.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-[16px] border border-[color:var(--line)] bg-[color:var(--surface-muted)] text-sm text-[color:var(--muted)]">
        No balance projection yet. Run the projection refresh to generate forecast data.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} opacity={0.7} />
        <XAxis
          dataKey="date"
          minTickGap={28}
          stroke={chartTheme.text}
          style={{ fontSize: '12px' }}
        />
        <YAxis
          stroke={chartTheme.text}
          style={{ fontSize: '12px' }}
          tickFormatter={formatCurrency}
        />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), 'Projected balance']}
          labelFormatter={labelFormatter}
          contentStyle={{
            backgroundColor: chartTheme.tooltipBg,
            border: `1px solid ${chartTheme.tooltipBorder}`,
            borderRadius: '18px',
            color: 'var(--text)',
            boxShadow: 'var(--shadow-crisp)',
          }}
        />
        <Line
          type="monotone"
          dataKey="balance"
          stroke={chartTheme.line}
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 6 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
