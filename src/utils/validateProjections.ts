//src/utils/validateProjections.ts

import { supabase } from '../lib/supabase'
import { addDays, parseISO, startOfDay, format, isWeekend } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

const TIMEZONE = 'America/Chicago'

// --- Holiday and date adjustment logic (ported from projection function) ---
async function fetchUSHolidays(start: Date, end: Date): Promise<Set<string>> {
  const holidays = new Set<string>();
  for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);
    if (res.ok) {
      const data = await res.json();
      data.forEach((h: { date: string }) => holidays.add(h.date));
    }
  }
  return holidays;
}

function adjustTransactionDate(date: Date, isPaycheck: boolean, holidays: Set<string>): Date {
  let d = new Date(date);
  const dateStr = (d: Date) => formatInTimeZone(d, TIMEZONE, 'yyyy-MM-dd');
  while (true) {
    if (isPaycheck) {
      if (isWeekend(d)) {
        d.setDate(d.getDate() - 1);
        continue;
      }
      if (holidays.has(dateStr(d))) {
        d.setDate(d.getDate() - 1);
        continue;
      }
    } else {
      if (isWeekend(d)) {
        d.setDate(d.getDate() + (8 - d.getDay()) % 7);
        continue;
      }
      if (holidays.has(dateStr(d))) {
        d.setDate(d.getDate() + 1);
        continue;
      }
    }
    break;
  }
  return d;
}

interface ValidationResult {
  missingInProjections: Array<{
    bill: {
      name: string
      amount: number
      frequency: string
      start_date: string
      category: string
    }
    expectedDate: string
  }>
  extraInProjections: Array<{
    date: string
    bill: {
      name: string
      amount: number
      category: string
    }
  }>
  summary: {
    totalBills: number
    totalProjections: number
    missingCount: number
    extraCount: number
  }
}

function shouldBillOccurOnDate(bill: any, date: Date): boolean {
  const billStart = parseISO(bill.start_date)
  const billEnd = bill.end_date ? parseISO(bill.end_date) : null

  // Check if date is within bill's active period
  if (date < billStart || (billEnd && date > billEnd)) {
    return false
  }

  // For one-time bills, only check the start date
  if (bill.frequency === 'one-time') {
    return format(date, 'yyyy-MM-dd') === format(billStart, 'yyyy-MM-dd')
  }

  // For daily bills
  if (bill.frequency === 'daily') {
    const daysSinceStart = Math.floor((date.getTime() - billStart.getTime()) / (1000 * 60 * 60 * 24))
    return daysSinceStart % bill.repeats_every === 0
  }

  // For weekly bills
  if (bill.frequency === 'weekly') {
    const daysSinceStart = Math.floor((date.getTime() - billStart.getTime()) / (1000 * 60 * 60 * 24))
    return daysSinceStart % (7 * bill.repeats_every) === 0
  }

  // For monthly bills
  if (bill.frequency === 'monthly') {
    const monthsSinceStart = (date.getFullYear() - billStart.getFullYear()) * 12 + 
                            (date.getMonth() - billStart.getMonth())
    return monthsSinceStart % bill.repeats_every === 0 && 
           date.getDate() === billStart.getDate()
  }

  // For yearly bills
  if (bill.frequency === 'yearly') {
    const yearsSinceStart = date.getFullYear() - billStart.getFullYear()
    return yearsSinceStart % bill.repeats_every === 0 && 
           date.getMonth() === billStart.getMonth() && 
           date.getDate() === billStart.getDate()
  }

  return false
}

export async function validateProjections(): Promise<ValidationResult> {
  // Get settings to know projection days
  const { data: settings } = await supabase
    .from('settings')
    .select('projection_days')
    .limit(1)
    .maybeSingle()

  if (!settings) {
    throw new Error('Failed to fetch settings')
  }

  const projectionDays = settings.projection_days || 30
  const today = formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd')
  const endDate = formatInTimeZone(addDays(new Date(), projectionDays), TIMEZONE, 'yyyy-MM-dd')

  // Get all bills
  const { data: bills } = await supabase
    .from('bills')
    .select('*')
    .order('start_date', { ascending: true })

  if (!bills) {
    throw new Error('Failed to fetch bills')
  }

  // Get all projections
  const { data: projections } = await supabase
    .from('projections')
    .select('*')
    .gte('proj_date', today)
    .lte('proj_date', endDate)
    .order('proj_date', { ascending: true })

  if (!projections) {
    throw new Error('Failed to fetch projections')
  }

  // Fetch holidays for the projection window
  const holidays = await fetchUSHolidays(parseISO(today), parseISO(endDate));

  // Create a map of expected bills by date
  const expectedBills = new Map<string, Set<string>>()
  const actualBills = new Map<string, Set<string>>()

  // Helper to create a unique bill key
  const billKey = (bill: any) => `${bill.name}|${bill.amount}|${bill.category}`

  // Process all projections to get actual bills
  for (const proj of projections) {
    if (!proj.bills) continue

    if (!actualBills.has(proj.proj_date)) {
      actualBills.set(proj.proj_date, new Set())
    }

    for (const bill of proj.bills) {
      actualBills.get(proj.proj_date)!.add(billKey(bill))
    }
  }

  // For each projection date, check which bills should occur (with adjustment)
  for (const proj of projections) {
    const projDate = parseISO(proj.proj_date)
    // Check each bill to see if it should occur on this date
    for (const bill of bills) {
      // Determine intended date
      let intendedDate: Date | null = null;
      if (shouldBillOccurOnDate(bill, projDate)) {
        intendedDate = new Date(projDate);
      }
      if (intendedDate) {
        // Adjust for weekends/holidays (skip for daily)
        let adjustedDate = new Date(intendedDate);
        const isPaycheck = bill.category && bill.category.toLowerCase() === 'paycheck';
        if (bill.frequency !== 'daily') {
          adjustedDate = adjustTransactionDate(adjustedDate, isPaycheck, holidays);
        }
        const adjustedDateStr = formatInTimeZone(adjustedDate, TIMEZONE, 'yyyy-MM-dd');
        if (!expectedBills.has(adjustedDateStr)) {
          expectedBills.set(adjustedDateStr, new Set());
        }
        expectedBills.get(adjustedDateStr)!.add(billKey(bill));
      }
    }
  }

  // Find missing and extra bills
  const missingInProjections: ValidationResult['missingInProjections'] = []
  const extraInProjections: ValidationResult['extraInProjections'] = []

  // Check for missing bills
  for (const [date, expected] of expectedBills) {
    const actual = actualBills.get(date) || new Set()
    
    for (const billKey of expected) {
      if (!actual.has(billKey)) {
        const [name, amount, category] = billKey.split('|')
        const bill = bills.find(b => b.name === name && b.amount === Number(amount) && b.category === category)
        if (bill) {
          missingInProjections.push({
            bill: {
              name: bill.name,
              amount: bill.amount,
              frequency: bill.frequency,
              start_date: bill.start_date,
              category: bill.category
            },
            expectedDate: date
          })
        }
      }
    }
  }

  // Check for extra bills
  for (const [date, actual] of actualBills) {
    const expected = expectedBills.get(date) || new Set()
    
    for (const billKey of actual) {
      if (!expected.has(billKey)) {
        const [name, amount, category] = billKey.split('|')
        extraInProjections.push({
          date,
          bill: {
            name,
            amount: Number(amount),
            category
          }
        })
      }
    }
  }

  return {
    missingInProjections,
    extraInProjections,
    summary: {
      totalBills: bills.length,
      totalProjections: projections.length,
      missingCount: missingInProjections.length,
      extraCount: extraInProjections.length
    }
  }
} 