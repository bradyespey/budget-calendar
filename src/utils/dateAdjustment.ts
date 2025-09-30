//src/utils/dateAdjustment.ts

import { isWeekend } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

const TIMEZONE = 'America/Chicago'

// Fetch US holidays for a given date range
export async function fetchUSHolidays(start: Date, end: Date): Promise<Set<string>> {
  const holidays = new Set<string>();
  for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);
      if (res.ok) {
        const data = await res.json();
        data.forEach((h: { date: string }) => holidays.add(h.date));
      }
    } catch (error) {
      // Failed to fetch holidays - continue without holiday data
    }
  }
  return holidays;
}

// Adjust transaction date to avoid weekends and holidays
export function adjustTransactionDate(date: Date, isPaycheck: boolean, holidays: Set<string>): Date {
  let d = new Date(date);
  const dateStr = (d: Date) => formatInTimeZone(d, TIMEZONE, 'yyyy-MM-dd');
  
  while (true) {
    if (isPaycheck) {
      // Paychecks move to previous weekday (not weekend or holiday)
      if (isWeekend(d)) {
        d.setDate(d.getDate() - 1);
        continue;
      }
      if (holidays.has(dateStr(d))) {
        d.setDate(d.getDate() - 1);
        continue;
      }
    } else {
      // Bills move to next weekday (not weekend or holiday)
      if (isWeekend(d)) {
        // Move to next Monday (or Tuesday if Monday is a holiday)
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

// Check if a date is a weekend or holiday
export function isWeekendOrHoliday(date: Date, holidays: Set<string>): boolean {
  const dateStr = formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd');
  return isWeekend(date) || holidays.has(dateStr);
}

// Get the next business day (not weekend or holiday)
export function getNextBusinessDay(date: Date, holidays: Set<string>): Date {
  let d = new Date(date);
  d.setDate(d.getDate() + 1);
  return adjustTransactionDate(d, false, holidays);
}

// Get the previous business day (not weekend or holiday)
export function getPreviousBusinessDay(date: Date, holidays: Set<string>): Date {
  let d = new Date(date);
  d.setDate(d.getDate() - 1);
  return adjustTransactionDate(d, true, holidays);
}

