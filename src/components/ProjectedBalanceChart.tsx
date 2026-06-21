//src/components/ProjectedBalanceChart.tsx

import { useId, useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { Projection } from '../types'

interface ProjectedBalanceChartProps {
  data: Projection[]
  lowBalanceThreshold: number
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

export function ProjectedBalanceChart({ data, lowBalanceThreshold }: ProjectedBalanceChartProps) {
  const gradientId = useId().replace(/:/g, '')
  const chartTheme =
    typeof window === 'undefined'
      ? {
          grid: '#cbd5e1',
          success: '#2c8b6d',
          warning: '#c37a3a',
          danger: '#c45045',
          text: '#64748b',
          tooltipBg: '#0f172a',
          tooltipBorder: '#334155',
        }
      : (() => {
          const styles = getComputedStyle(document.documentElement)
          return {
            grid: styles.getPropertyValue('--line-strong').trim() || '#cbd5e1',
            success: styles.getPropertyValue('--success').trim() || '#2c8b6d',
            warning: styles.getPropertyValue('--warning').trim() || '#c37a3a',
            danger: styles.getPropertyValue('--danger').trim() || '#c45045',
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

  const yScale = useMemo(() => {
    const balances = chartData.map(item => item.balance)
    const rawMin = Math.min(...balances, 0, lowBalanceThreshold)
    const rawMax = Math.max(...balances, lowBalanceThreshold)
    const range = Math.max(rawMax - rawMin, 1)
    const padding = Math.max(range * 0.08, 500)
    const min = Math.floor(rawMin - padding)
    const max = Math.ceil(rawMax + padding)
    const offsetForValue = (value: number) => clamp(((max - value) / (max - min)) * 100)

    return {
      domain: [min, max] as [number, number],
      thresholdOffset: offsetForValue(lowBalanceThreshold),
      zeroOffset: offsetForValue(0),
    }
  }, [chartData, lowBalanceThreshold])

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
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartTheme.success} />
            <stop offset={`${yScale.thresholdOffset}%`} stopColor={chartTheme.success} />
            <stop offset={`${yScale.thresholdOffset}%`} stopColor={chartTheme.warning} />
            <stop offset={`${yScale.zeroOffset}%`} stopColor={chartTheme.warning} />
            <stop offset={`${yScale.zeroOffset}%`} stopColor={chartTheme.danger} />
            <stop offset="100%" stopColor={chartTheme.danger} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} opacity={0.7} />
        <XAxis
          dataKey="date"
          minTickGap={28}
          stroke={chartTheme.text}
          style={{ fontSize: '12px' }}
        />
        <YAxis
          domain={yScale.domain}
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
          stroke={`url(#${gradientId})`}
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 6 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
