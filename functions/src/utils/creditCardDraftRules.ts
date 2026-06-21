type DraftRule = {
  label: string;
  dayOfMonth: number;
  monthOffset?: number;
  movement: 'next-business-day' | 'sunday-or-holiday';
  merchantPatterns: string[];
};

type CreditCardDraftBill = {
  name?: string | null;
  merchantName?: string | null;
  category?: string | null;
  originalDueDate?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  start_date?: string | null;
};

const CREDIT_CARD_DRAFT_RULES: DraftRule[] = [
  {
    label: 'chase-23rd-next-business-day',
    dayOfMonth: 23,
    movement: 'next-business-day',
    merchantPatterns: [
      'amazon prime credit',
      'chase southwest credit card',
    ],
  },
  {
    label: 'apple-card-1st-sunday-holiday',
    dayOfMonth: 1,
    monthOffset: 1,
    movement: 'sunday-or-holiday',
    merchantPatterns: ['apple card'],
  },
  {
    label: 'amex-14th-next-business-day',
    dayOfMonth: 14,
    movement: 'next-business-day',
    merchantPatterns: [
      'american express',
      'american express credit',
    ],
  },
];

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function formatYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateFromYMD(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function fixedDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

function getNthWeekday(year: number, monthIndex: number, weekday: number, nth: number): Date {
  const date = fixedDate(year, monthIndex, 1);
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset + ((nth - 1) * 7));
  return date;
}

function getLastWeekday(year: number, monthIndex: number, weekday: number): Date {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0, 12, 0, 0));
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}

function getObservedHoliday(year: number, monthIndex: number, day: number): string {
  const holiday = fixedDate(year, monthIndex, day);
  if (holiday.getUTCDay() === 6) holiday.setUTCDate(holiday.getUTCDate() - 1);
  if (holiday.getUTCDay() === 0) holiday.setUTCDate(holiday.getUTCDate() + 1);
  return formatYMD(holiday);
}

function getFederalBankHolidays(year: number): Set<string> {
  return new Set([
    getObservedHoliday(year, 0, 1),
    formatYMD(getNthWeekday(year, 0, 1, 3)),
    formatYMD(getNthWeekday(year, 1, 1, 3)),
    formatYMD(getLastWeekday(year, 4, 1)),
    getObservedHoliday(year, 5, 19),
    getObservedHoliday(year, 6, 4),
    formatYMD(getNthWeekday(year, 8, 1, 1)),
    formatYMD(getNthWeekday(year, 9, 1, 2)),
    getObservedHoliday(year, 10, 11),
    formatYMD(getNthWeekday(year, 10, 4, 4)),
    getObservedHoliday(year, 11, 25),
  ]);
}

function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;

  return !isFederalBankHoliday(date);
}

function isFederalBankHoliday(date: Date): boolean {
  const year = date.getUTCFullYear();
  const holidays = new Set([
    ...getFederalBankHolidays(year - 1),
    ...getFederalBankHolidays(year),
    ...getFederalBankHolidays(year + 1),
  ]);

  return holidays.has(formatYMD(date));
}

function moveToNextBusinessDay(date: Date): Date {
  const next = new Date(date);
  while (!isBusinessDay(next)) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function moveForSundayOrHoliday(date: Date): Date {
  const next = new Date(date);
  while (next.getUTCDay() === 0 || isFederalBankHoliday(next)) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function findDraftRule(bill: CreditCardDraftBill): DraftRule | null {
  const names = [
    normalize(bill.name),
    normalize(bill.merchantName),
  ].filter(Boolean);

  return CREDIT_CARD_DRAFT_RULES.find(rule =>
    names.some(name => rule.merchantPatterns.some(pattern => name.includes(pattern)))
  ) ?? null;
}

export function isCreditCardPaymentBill(bill: CreditCardDraftBill): boolean {
  return normalize(bill.category).includes('credit card payment');
}

export function getCreditCardDraftDetails(bill: CreditCardDraftBill): {
  checkingImpactDate: string;
  originalDueDate: string;
  draftRule: string;
} | null {
  if (!isCreditCardPaymentBill(bill)) return null;

  const rule = findDraftRule(bill);
  if (!rule) return null;

  const sourceDate = bill.originalDueDate || bill.dueDate || bill.startDate || bill.start_date;
  if (typeof sourceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) {
    return null;
  }

  const dueDate = dateFromYMD(sourceDate);
  const ruleMonth = new Date(Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth() + (rule.monthOffset ?? 0),
    1,
    12,
    0,
    0
  ));
  const year = ruleMonth.getUTCFullYear();
  const monthIndex = ruleMonth.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const draftDay = Math.min(rule.dayOfMonth, lastDayOfMonth);
  const baseDraftDate = fixedDate(year, monthIndex, draftDay);
  const draftDate = rule.movement === 'sunday-or-holiday'
    ? moveForSundayOrHoliday(baseDraftDate)
    : moveToNextBusinessDay(baseDraftDate);

  return {
    checkingImpactDate: formatYMD(draftDate),
    originalDueDate: sourceDate,
    draftRule: rule.label,
  };
}
