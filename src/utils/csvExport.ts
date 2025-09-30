import { format, parseISO } from 'date-fns'
import { getBills } from '../api/bills'

export async function exportBillsToCSV() {
  const bills = await getBills();
  if (!bills) return;
  
  const headers = [
    'Name', 'Date', 'Frequency', 'Account', 'Account Type', 'Category', 'Amount', 'Source', 'Notes'
  ];

  const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
  const freqLabel = (f: string) => {
    if (f === 'daily') return 'Days';
    if (f === 'weekly') return 'Weeks';
    if (f === 'monthly') return 'Months';
    if (f === 'yearly') return 'Years';
    if (f === 'one-time') return 'One-time';
    return f;
  };
  
  const currency = (n: number) => {
    const abs = Math.abs(n);
    const formatted = `$${abs.toFixed(2)}`;
    return n < 0 ? `-$${abs.toFixed(2)}`.replace('--', '-') : formatted;
  };
  
  const calcMonthly = (amount: number, freq: string, repeatsEvery: number) => {
    const r = repeatsEvery || 1;
    switch (freq) {
      case 'daily': return (amount * 30.44) / r;
      case 'weekly': return (amount * 4.35) / r;
      case 'monthly': return amount / r;
      case 'yearly': return amount / (12 * r);
      case 'one-time': return 0;
      default: return amount / r;
    }
  };
  
  const calcYearly = (amount: number, freq: string, repeatsEvery: number) => {
    const r = repeatsEvery || 1;
    switch (freq) {
      case 'daily': return (amount * 365.25) / r;
      case 'weekly': return (amount * 52.18) / r;
      case 'monthly': return (amount * 12) / r;
      case 'yearly': return amount / r;
      case 'one-time': return 0;
      default: return (amount * 12) / r;
    }
  };

  const csvContent = [
    headers.join(','),
    ...bills.map(bill => {
      return [
        `"${bill.name}"`,
        `"${format(parseISO(bill.start_date), 'M/d/yyyy')}"`,
        `"${freqLabel(bill.frequency)}"`,
        `"${bill.accountName || ''}"`,
        `"${bill.accountType || ''}"`,
        `"${titleCase(bill.category)}"`,
        bill.amount < 0 ? `-$${Math.abs(bill.amount).toFixed(2)}` : `$${bill.amount.toFixed(2)}`,
        `"${bill.source || ''}"`,
        bill.notes ? `"${bill.notes}"` : ''
      ].join(',');
    })
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `bills-export-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

export function downloadSampleCSV() {
  const headers = ['Name', 'Date', 'Frequency', 'Account', 'Account Type', 'Category', 'Amount', 'Source', 'Notes'];
  const sampleData = [
    ['Test Rent Monthly', '1/1/2025', 'Monthly', 'Chase Checking', 'checking', 'Housing', '-$1000', 'manual', 'Monthly rent payment'],
    ['Test Groceries Weekly', '1/1/2025', 'Weekly', 'Chase Checking', 'checking', 'Food & Drinks', '-$50', 'manual', 'Weekly grocery budget'],
    ['Test Credit Card Payment', '1/15/2025', 'Monthly', 'Chase Checking', 'checking', 'Credit Card Payment', '-$500', 'manual', 'Monthly credit card payment'],
    ['Test Subscription', '1/1/2025', 'Monthly', 'Chase Southwest', 'credit', 'Streaming', '-$20', 'monarch', 'Netflix subscription'],
    ['Test Gym Yearly', '1/1/2025', 'Yearly', 'Chase Checking', 'checking', 'Fitness', '-$100', 'manual', 'Annual gym membership']
  ];
  
  const csvContent = [
    headers.join(','),
    ...sampleData.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'bills-template.csv';
  link.click();
}
