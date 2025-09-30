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

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month (1st & 15th)' },
  { value: 'semimonthly_mid_end', label: 'Twice a month (15th & last day)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one-time', label: 'One-time' },
];


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
