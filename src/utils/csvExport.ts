import { format, parseISO } from 'date-fns'
import { getBills } from '../api/bills'

export async function exportBillsToCSV() {
  const bills = await getBills();
  if (!bills) return;
  
  const headers = ['Name', 'Category', 'Amount', 'Repeats Every', 'Frequency', 'Start Date', 'End Date', 'Note', 'Monthly Cost', 'Yearly Cost'];

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
      const monthly = calcMonthly(bill.amount, bill.frequency, bill.repeats_every);
      const yearly = calcYearly(bill.amount, bill.frequency, bill.repeats_every);
      return [
        `"${bill.name}"`,
        `"${titleCase(bill.category)}"`,
        bill.amount < 0 ? `-$${Math.abs(bill.amount).toFixed(2)}` : `$${bill.amount.toFixed(2)}`,
        bill.repeats_every,
        `"${freqLabel(bill.frequency)}"`,
        `"${format(parseISO(bill.start_date), 'M/d/yyyy')}"`,
        bill.end_date ? `"${format(parseISO(bill.end_date), 'M/d/yyyy')}"` : '',
        bill.notes ? `"${bill.notes}"` : '',
        bill.amount !== 0 ? currency(monthly) : '$0',
        bill.amount !== 0 ? currency(yearly) : '$0'
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
  const headers = ['Name', 'Category', 'Amount', 'Repeats Every', 'Frequency', 'Start Date', 'End Date', 'Note', 'Monthly Cost', 'Yearly Cost'];
  const sampleData = [
    ['Test Rent Monthly', 'House', '-$1,000', '1', 'Months', '8/7/2025', '', 'Monthly rent payment', '-$1,000', '-$12,000'],
    ['Test Groceries Weekly', 'Food & Drinks', '-$50', '1', 'Weeks', '8/9/2025', '', '', '-$217', '-$2,600'],
    ['Test Credit Card', 'Credit Card', '-$500', '1', 'Months', '8/11/2025', '', '', '-$500', '-$6,000'],
    ['Test Subscription Every 5 Days', 'Subscription', '-$20', '5', 'Days', '8/13/2025', '9/11/2025', '', '-$122', '-$1,460'],
    ['Test Gym Yearly', 'Fitness', '-$100', '1', 'Years', '8/15/2025', '', 'Once a year test', '-$8', '-$100']
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
