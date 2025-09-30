//src/utils/validateProjections.ts

import { getSettings, getBills, getProjections } from '../api/firebase'
import { addDays, parseISO, startOfDay, format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { fetchUSHolidays, adjustTransactionDate } from './dateAdjustment'

const TIMEZONE = 'America/Chicago'

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
  const billStart = parseISO(bill.startDate)
  const billEnd = bill.endDate ? parseISO(bill.endDate) : null
  const repeatsEvery = Number(bill.repeats_every ?? bill.repeatsEvery ?? 1) || 1

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
    return daysSinceStart >= 0 && daysSinceStart % repeatsEvery === 0
  }

  // For weekly bills
  if (bill.frequency === 'weekly') {
    const daysSinceStart = Math.floor((date.getTime() - billStart.getTime()) / (1000 * 60 * 60 * 24))
    return daysSinceStart >= 0 && daysSinceStart % (7 * repeatsEvery) === 0
  }

  // Handle "Every X weeks" frequencies
  if (bill.frequency.startsWith('every_') && bill.frequency.includes('_weeks')) {
    const weeksMatch = bill.frequency.match(/every_(\d+)_weeks/)
    if (weeksMatch) {
      const weekInterval = parseInt(weeksMatch[1])
      const daysSinceStart = Math.floor((date.getTime() - billStart.getTime()) / (1000 * 60 * 60 * 24))
      return daysSinceStart >= 0 && daysSinceStart % (7 * weekInterval) === 0
    }
  }

  // For biweekly bills
  if (bill.frequency === 'biweekly') {
    const daysSinceStart = Math.floor((date.getTime() - billStart.getTime()) / (1000 * 60 * 60 * 24))
    return daysSinceStart >= 0 && daysSinceStart % (14 * repeatsEvery) === 0
  }

  // For monthly bills
  if (bill.frequency === 'monthly') {
    const monthsSinceStart = (date.getFullYear() - billStart.getFullYear()) * 12 + 
                            (date.getMonth() - billStart.getMonth())
    const billDay = billStart.getDate()
    const checkDay = date.getDate()
    
    // Handle end-of-month scenarios
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    
    if (monthsSinceStart >= 0 && monthsSinceStart % repeatsEvery === 0) {
      if (billDay > lastDayOfMonth) {
        return checkDay === lastDayOfMonth
      } else {
        return checkDay === billDay
      }
    }
  }

  // Handle "Every X months" frequencies
  if (bill.frequency.startsWith('every_') && bill.frequency.includes('_months')) {
    const monthsMatch = bill.frequency.match(/every_(\d+)_months/)
    if (monthsMatch) {
      const monthInterval = parseInt(monthsMatch[1])
      const monthsSinceStart = (date.getFullYear() - billStart.getFullYear()) * 12 + 
                              (date.getMonth() - billStart.getMonth())
      const billDay = billStart.getDate()
      const checkDay = date.getDate()
      
      if (monthsSinceStart >= 0 && monthsSinceStart % monthInterval === 0) {
        // Handle end-of-month scenarios
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
        
        if (billDay > lastDayOfMonth) {
          return checkDay === lastDayOfMonth
        } else {
          return checkDay === billDay
        }
      }
    }
  }

  // For semimonthly bills (1st & 15th)
  if (bill.frequency === 'semimonthly') {
    const checkDay = date.getDate()
    return checkDay === 1 || checkDay === 15
  }

  // For semimonthly mid-end bills (15th & last day)
  if (bill.frequency === 'Semimonthly_mid_end' || bill.frequency === 'semimonthly_mid_end') {
    const checkDay = date.getDate()
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    return checkDay === 15 || checkDay === lastDayOfMonth
  }

  // For yearly bills
  if (bill.frequency === 'yearly') {
    const yearsSinceStart = date.getFullYear() - billStart.getFullYear()
    const billDay = billStart.getDate()
    const checkDay = date.getDate()
    
    if (yearsSinceStart >= 0 && yearsSinceStart % repeatsEvery === 0) {
      // Handle end-of-month scenarios for yearly bills too (e.g., Feb 29th)
      if (billStart.getMonth() === date.getMonth()) {
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
        
        if (billDay > lastDayOfMonth) {
          return checkDay === lastDayOfMonth
        } else {
          return checkDay === billDay
        }
      }
    }
  }

  return false
}

export async function validateProjections(): Promise<ValidationResult> {
  // Get settings to know projection days
  const settings = await getSettings()

  if (!settings) {
    throw new Error('Failed to fetch settings')
  }

  const projectionDays = settings.projectionDays || 30
  const today = formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd')
  // End date is projectionDays-1 to match budgetProjection's range (days 0 to projectionDays-1)
  const endDate = formatInTimeZone(addDays(new Date(), projectionDays - 1), TIMEZONE, 'yyyy-MM-dd')

  // Get all bills
  const bills = await getBills()

  if (!bills) {
    throw new Error('Failed to fetch bills')
  }

  // Get all projections
  const allProjections = await getProjections()
  
  // Filter projections to the date range
  const projections = allProjections.filter(proj => {
    const projDate = proj.projDate
    return projDate >= today && projDate <= endDate
  }).sort((a, b) => a.projDate.localeCompare(b.projDate))

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

    if (!actualBills.has(proj.projDate)) {
      actualBills.set(proj.projDate, new Set())
    }

    for (const bill of proj.bills) {
      actualBills.get(proj.projDate)!.add(billKey(bill))
    }
  }

  // Track bills that are pushed beyond projection range due to weekend/holiday adjustment
  const billsBeyondRange = new Set<string>();

  // For each projection date, check which bills should occur (with adjustment)
  for (const proj of projections) {
    const projDate = parseISO(proj.projDate)
    
    // Check each bill to see if it should occur on this date
    for (const bill of bills) {
      // Determine if bill should occur on this date
      if (shouldBillOccurOnDate(bill, projDate)) {
        // Adjust for weekends/holidays (skip for daily)
        let adjustedDate = new Date(projDate);
        const isPaycheck = bill.category && bill.category.toLowerCase() === 'paycheck';
        if (bill.frequency !== 'daily') {
          adjustedDate = adjustTransactionDate(adjustedDate, isPaycheck, holidays);
        }
        const adjustedDateStr = formatInTimeZone(adjustedDate, TIMEZONE, 'yyyy-MM-dd');
        
        // Only add to expected if this adjusted date is within our projection range
        if (adjustedDateStr >= today && adjustedDateStr <= endDate) {
          if (!expectedBills.has(adjustedDateStr)) {
            expectedBills.set(adjustedDateStr, new Set());
          }
          expectedBills.get(adjustedDateStr)!.add(billKey(bill));
        } else {
          // Track bills pushed beyond projection range due to weekend/holiday adjustment
          billsBeyondRange.add(billKey(bill));
        }
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
          // Don't flag as missing if this bill is pushed beyond projection range due to weekend/holiday adjustment
          if (!billsBeyondRange.has(billKey)) {
            missingInProjections.push({
              bill: {
                name: bill.name,
                amount: bill.amount,
                frequency: bill.frequency,
                start_date: bill.startDate,
                category: bill.category
              },
              expectedDate: date
            })
          }
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