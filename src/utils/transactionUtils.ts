//src/utils/transactionUtils.ts

export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rounded);
}

function getLocalDate(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`);
}

function toIsoDate(date: Date) {
  return date.toISOString().split('T')[0];
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function addMonthsClamped(date: Date, months: number) {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  next.setDate(Math.min(originalDay, daysInMonth(next.getFullYear(), next.getMonth())));
  next.setHours(12, 0, 0, 0);
  return next;
}

function getNextSemiMonthlyDate(frequency: string, today: Date) {
  const current = new Date(today);
  current.setHours(12, 0, 0, 0);

  for (let monthOffset = 0; monthOffset < 3; monthOffset += 1) {
    const monthBase = new Date(current.getFullYear(), current.getMonth() + monthOffset, 1, 12);
    const lastDay = daysInMonth(monthBase.getFullYear(), monthBase.getMonth());
    const days = frequency === 'semimonthly_mid_end' || frequency === 'Semimonthly_mid_end'
      ? [15, lastDay]
      : [1, 15];

    for (const day of days) {
      const candidate = new Date(monthBase.getFullYear(), monthBase.getMonth(), day, 12);
      if (candidate >= current) return toIsoDate(candidate);
    }
  }

  return toIsoDate(current);
}

function getIntervalFromFrequency(frequency: string, repeatsEvery: number) {
  if (frequency === 'daily') return { unit: 'day' as const, count: repeatsEvery || 1 };
  if (frequency === 'weekly') return { unit: 'day' as const, count: 7 * (repeatsEvery || 1) };
  if (frequency === 'biweekly') return { unit: 'day' as const, count: 14 * (repeatsEvery || 1) };
  if (frequency === 'monthly') return { unit: 'month' as const, count: repeatsEvery || 1 };
  if (frequency === 'yearly') return { unit: 'month' as const, count: 12 * (repeatsEvery || 1) };

  const everyWeeks = frequency.match(/^every_(\d+)_weeks$/);
  if (everyWeeks) return { unit: 'day' as const, count: Number(everyWeeks[1]) * 7 * (repeatsEvery || 1) };

  const everyMonths = frequency.match(/^every_(\d+)_months$/);
  if (everyMonths) return { unit: 'month' as const, count: Number(everyMonths[1]) * (repeatsEvery || 1) };

  return null;
}

export function getNextOccurrenceDate(startDate: string, frequency: string, repeatsEvery = 1, today = new Date()): string {
  if (!startDate || frequency === 'one-time') return startDate;

  const start = getLocalDate(startDate);
  const current = new Date(today);
  current.setHours(12, 0, 0, 0);

  if (start >= current) return startDate;

  if (frequency === 'semimonthly' || frequency === 'semimonthly_mid_end' || frequency === 'Semimonthly_mid_end') {
    return getNextSemiMonthlyDate(frequency, current);
  }

  const interval = getIntervalFromFrequency(frequency, repeatsEvery);
  if (!interval) return startDate;

  if (interval.unit === 'day') {
    const diffMs = current.getTime() - start.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const elapsedDays = Math.max(0, Math.floor(diffMs / dayMs));
    const intervalsElapsed = Math.ceil(elapsedDays / interval.count);
    const next = new Date(start);
    next.setDate(start.getDate() + intervalsElapsed * interval.count);
    next.setHours(12, 0, 0, 0);
    return toIsoDate(next);
  }

  let next = new Date(start);
  while (next < current) {
    next = addMonthsClamped(next, interval.count);
  }
  return toIsoDate(next);
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'semimonthly', label: 'Twice a month (1st & 15th)' },
  { value: 'semimonthly_mid_end', label: 'Twice a month (15th & last day)' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one-time', label: 'One-time' },
];

export function formatFrequencyLabel(frequency: string): string {
  const frequencyOption = FREQUENCY_OPTIONS.find((option) => option.value === frequency);
  if (frequencyOption) {
    if (frequency === 'semimonthly' || frequency === 'semimonthly_mid_end') return 'Twice monthly';
    return frequencyOption.label;
  }

  const everyWeeks = frequency.match(/^every_(\d+)_weeks$/);
  if (everyWeeks) return `Every ${everyWeeks[1]} weeks`;

  const everyMonths = frequency.match(/^every_(\d+)_months$/);
  if (everyMonths) return `Every ${everyMonths[1]} months`;

  return capitalize(frequency.replace(/_/g, ' '));
}

export function shortenAccountName(accountName: string): string {
  const accountMappings: Record<string, string> = {
    'Chase Southwest Credit Card': 'Chase Southwest',
    'American Express Credit': 'Amex',
    'Amazon Prime Credit': 'Amazon Prime',
    'Chase Checking': 'Chase Checking',
    'Apple Card': 'Apple Card',
    'Chase Sapphire Preferred': 'Chase Sapphire',
    'Capital One Venture': 'Capital One',
    'Wells Fargo Checking': 'Wells Fargo',
    'Bank of America Checking': 'BofA',
    'Citi Double Cash': 'Citi',
    'Discover It': 'Discover',
    'Chase Freedom': 'Chase Freedom',
    'Chase Freedom Unlimited': 'Chase Freedom',
  };

  return accountMappings[accountName] || accountName;
}
