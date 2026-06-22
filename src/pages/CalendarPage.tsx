//src/pages/CalendarPage.tsx

import { useEffect, useState, useMemo, useRef } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { addDays, parseISO } from 'date-fns';
import { getProjections, triggerManualRecalculation } from '../api/projections';
import { Projection } from '../types';
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, RefreshCw, TrendingUp, TrendingDown, Search, X } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { getFunctionTimestamps, refreshRecurringTransactions, saveFunctionTimestamp } from '../api/firebase';
import { useLocation } from 'react-router-dom';
import { formatInTimeZone } from 'date-fns-tz';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { SectionInfoHeading } from '../components/ui/SectionInfoHeading';

interface DayData {
  date: string;
  balance: number;
  transactions: {
    id: string;
    name: string;
    amount: number;
    category: string;
    accountType?: string;
    source?: string;
    isActive?: boolean;
  }[];
  isHighest: boolean;
  isLowest: boolean;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
type ForecastView = 'month' | 'week' | 'day';

// Helper function to determine if a transaction affects balance calculations
const affectsBalance = (transaction: DayData['transactions'][0]): boolean => {
  // Skip inactive bills (past credit card payments, etc.)
  if (transaction.isActive === false) return false;

  // Skip bills from credit card accounts (they're already in the CC payment)
  // This applies to both manual and Monarch transactions
  if (transaction.accountType === 'Credit Card') return false;

  // Credit card payment transactions affect balance (they hit checking)
  if (transaction.category && transaction.category.toLowerCase().includes('credit card payment')) return true;

  // Everything else affects balance (manual budgets, checking account bills, income, etc.)
  return true;
};

function sortTransactionsByLargest(transactions: DayData['transactions']) {
  return [...transactions].sort((a, b) => Math.abs(Number(b.amount) || 0) - Math.abs(Number(a.amount) || 0));
}

function getLocalDate(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`);
}

function getIsoDate(date: Date) {
  return formatInTimeZone(date, 'America/Chicago', 'yyyy-MM-dd');
}

function getMondayStart(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(12, 0, 0, 0);
  return next;
}

function getMonthCells(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
  const start = getMondayStart(first);
  const end = addDays(getMondayStart(last), 6);
  const cells: Date[] = [];

  for (let current = start; current <= end; current = addDays(current, 1)) {
    cells.push(current);
  }

  return cells;
}

function getViewDates(view: ForecastView, anchor: Date) {
  if (view === 'day') return [anchor];
  if (view === 'week') {
    const start = getMondayStart(anchor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }
  return getMonthCells(anchor);
}

function moveAnchor(view: ForecastView, anchor: Date, direction: -1 | 1) {
  const next = new Date(anchor);
  if (view === 'month') next.setMonth(next.getMonth() + direction);
  if (view === 'week') next.setDate(next.getDate() + (7 * direction));
  if (view === 'day') next.setDate(next.getDate() + direction);
  return next;
}

function formatCalendarTitle(view: ForecastView, anchor: Date) {
  if (view === 'month') {
    return formatInTimeZone(anchor, 'America/Chicago', 'MMMM yyyy');
  }
  if (view === 'week') {
    const start = getMondayStart(anchor);
    const end = addDays(start, 6);
    return `${formatInTimeZone(start, 'America/Chicago', 'MMM d')} - ${formatInTimeZone(end, 'America/Chicago', 'MMM d, yyyy')}`;
  }
  return formatInTimeZone(anchor, 'America/Chicago', 'EEEE, MMMM d, yyyy');
}

export function CalendarPage() {
  const [calendarDaysData, setCalendarDaysData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [budgetProjectionTimestamp, setBudgetProjectionTimestamp] = useState<Date | null>(null);
  const [syncCalendarTimestamp, setSyncCalendarTimestamp] = useState<Date | null>(null);
  const [refreshingProjection, setRefreshingProjection] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<ForecastView>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => getIsoDate(new Date()));
  const currentWeekRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const { session } = useAuth();
  const todayIso = getIsoDate(new Date());

  // Load function timestamps
  const loadTimestamps = async () => {
    try {
      const timestamps = await getFunctionTimestamps();
      if (timestamps.budgetProjection) {
        setBudgetProjectionTimestamp(timestamps.budgetProjection);
      }
      if (timestamps.syncCalendar) {
        setSyncCalendarTimestamp(timestamps.syncCalendar);
      }
    } catch (err) {
      console.error('Error loading timestamps:', err);
    }
  };

  const formatShortTimestamp = (date: Date | null): string => {
    if (!date) return 'Never';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  useEffect(() => {
    fetchCalendarData();
    loadTimestamps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, session.isAuthenticated]);

  const fetchCalendarData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);

      // We only need projections now since they contain the bills
      const projections = await getProjections();

      // Process the data to create a day-by-day view
      const days = processDayData(projections);
      setCalendarDaysData(days);
      if (days.length > 0) {
        const todayInForecast = days.find(day => day.date === todayIso)?.date;
        const nextAnchor = todayInForecast ?? days[0].date;
        setAnchor(getLocalDate(nextAnchor));
        setSelectedDate(nextAnchor);
      }
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const processDayData = (projections: Projection[]): DayData[] => {
    // Create the day data objects directly from projections
    return projections.map(proj => {
      return {
        date: proj.proj_date,
        balance: proj.projected_balance,
        transactions: sortTransactionsByLargest(
          (proj.bills || []).map(bill => ({
            id: bill.id,
            name: bill.name,
            amount: bill.amount,
            category: bill.category,
            accountType: bill.accountType,
            source: bill.source,
            isActive: bill.isActive
          }))
        ),
        isHighest: proj.highest,
        isLowest: proj.lowest
      };
    });
  };

  // Filter and search logic
  const filteredDays = useMemo(() => {
    if (!searchTerm.trim()) {
      return calendarDaysData;
    }

    const searchLower = searchTerm.toLowerCase();
    return calendarDaysData
      .map(day => ({
        ...day,
        transactions: day.transactions.filter(transaction =>
          transaction.name.toLowerCase().includes(searchLower) ||
          transaction.category.toLowerCase().includes(searchLower)
        )
      }))
      .filter(day => day.transactions.length > 0);
  }, [calendarDaysData, searchTerm]);

  // Calculate total occurrences of search term
  const totalOccurrences = useMemo(() => {
    if (!searchTerm.trim()) return 0;

    const searchLower = searchTerm.toLowerCase();
    return calendarDaysData.reduce((total, day) => {
      return total + day.transactions.filter(transaction =>
        transaction.name.toLowerCase().includes(searchLower) ||
        transaction.category.toLowerCase().includes(searchLower)
      ).length;
    }, 0);
  }, [calendarDaysData, searchTerm]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(Math.round(amount));
  };

  const formatSignedCurrency = (amount: number) => {
    if (Math.round(amount) === 0) return formatCurrency(0);
    const sign = amount >= 0 ? '+' : '-';
    return `${sign}${formatCurrency(Math.abs(amount))}`;
  };

  const balanceTextClass = (amount: number) => (
    amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-[color:var(--text)]'
  );

  const getBalanceChange = (day: DayData, index: number): number => {
    if (index === 0) return 0;
    // Calculate the change in balance (negative means money went out, positive means money came in)
    return day.balance - filteredDays[index - 1].balance;
  };

  const formatDate = (dateStr: string) => {
    return formatInTimeZone(parseISO(dateStr), 'America/Chicago', 'EEE, MMM d');
  };

  const calendarDays = useMemo(() => {
    const daysByDate = new Map(filteredDays.map(day => [day.date, day]));
    return getViewDates(view, anchor).map(current => {
      const date = getIsoDate(current);
      return { date, day: daysByDate.get(date) };
    });
  }, [anchor, filteredDays, view]);

  const currentWeekStartIso = getIsoDate(getMondayStart(getLocalDate(selectedDate)));

  useEffect(() => {
    if (loading || view !== 'month' || !currentWeekRef.current) return;

    const frame = requestAnimationFrame(() => {
      currentWeekRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });

    return () => cancelAnimationFrame(frame);
  }, [calendarDays.length, currentWeekStartIso, loading, view]);

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    if (view !== 'month') {
      setAnchor(getLocalDate(date));
    }
  };

  const handleMoveAnchor = (direction: -1 | 1) => {
    setAnchor(current => {
      const next = moveAnchor(view, current, direction);
      if (view === 'day') {
        setSelectedDate(getIsoDate(next));
      }
      return next;
    });
  };

  const handleToday = () => {
    const firstForecastDay = calendarDaysData[0]?.date;
    const todayInForecast = calendarDaysData.find(day => day.date === todayIso)?.date;
    const targetDate = todayInForecast ?? firstForecastDay ?? todayIso;
    setSelectedDate(targetDate);
    setAnchor(getLocalDate(targetDate));
  };

  const handleSelectView = (nextView: ForecastView) => {
    const targetDate = selectedDate || filteredDays[0]?.date || calendarDaysData[0]?.date;
    setView(nextView);
    if (targetDate) {
      setAnchor(getLocalDate(targetDate));
    }
  };

  const handleRefreshProjection = async () => {
    setRefreshingProjection(true);
    try {
      if (session.isAuthenticated) {
        await refreshRecurringTransactions();
        await triggerManualRecalculation();
        await saveFunctionTimestamp('budgetProjection');
      }
      await fetchCalendarData(false);
      await loadTimestamps();
    } catch (error) {
      console.error('Error refreshing projection:', error);
    } finally {
      setRefreshingProjection(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="surface-card flex items-center gap-3 px-6 py-5">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--line)] border-t-[color:var(--accent)]" />
          <div>
            <p className="eyebrow mb-2">Loading</p>
            <p className="text-sm text-[color:var(--muted)]">Building your calendar view.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="sticky-page-stack sticky top-3 z-40 space-y-3 pb-3">
        <PageHeader
          className="mb-0"
          eyebrow="Calendar"
          title={`${searchTerm ? `${filteredDays.length} of ${calendarDaysData.length}` : calendarDaysData.length}-Day Calendar`}
          statVariant="stacked"
          stats={[
            { label: 'Projection', value: formatShortTimestamp(budgetProjectionTimestamp), tone: 'neutral' },
            { label: 'Calendar Sync', value: formatShortTimestamp(syncCalendarTimestamp), tone: 'neutral' },
          ]}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefreshProjection}
                isLoading={refreshingProjection}
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Refresh
              </Button>
              <div className="flex items-center gap-2">
                {(['month', 'week', 'day'] as const).map(mode => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={view === mode ? 'primary' : 'outline'}
                    onClick={() => handleSelectView(mode)}
                    className="capitalize"
                  >
                    {mode}
                  </Button>
                ))}
              </div>
            </div>
          }
        />

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b surface-divider px-4 py-3">
            <div className="flex min-w-[180px] items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-[color:var(--accent)]" />
              <SectionInfoHeading
                title={formatCalendarTitle(view, anchor)}
                items={[
                  'All transactions appear here for awareness, including credit card charges, payments, utilities, and income.',
                  'Balance calculations include recurring bills that hit checking directly, credit card payments, manual budgets, and income.',
                  'Individual credit card charges are excluded from balance because they are already captured by the monthly credit card payment bill.',
                  'The credit card payment syncs from Monarch and reflects statement balance, so card spending is accounted for through that one payment.',
                  'Known credit-card payments may show a checking-impact date that differs from the original statement due date.',
                  'Bills move to the next business day on weekends or holidays; paychecks move to the previous business day.',
                ]}
                as="h2"
                headingClassName="truncate text-base font-bold"
              />
            </div>
            <div className="relative min-w-[260px] flex-1 lg:max-w-[520px]">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--muted)]" />
              <Input
                type="text"
                placeholder="Search transactions or categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 pl-9 pr-9 text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)] transition hover:text-[color:var(--text)]"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              {searchTerm && (
                <span className="whitespace-nowrap text-xs font-semibold text-[color:var(--muted)]">
                  {totalOccurrences} found
                </span>
              )}
              <div className="flex flex-wrap items-center gap-3 rounded-full border border-[color:var(--line)] bg-[color:var(--surface-muted)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--muted)]">
                <span>+ Credit</span>
                <span>- Debit</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Excluded
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleMoveAnchor(-1)} aria-label="Previous period">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleToday}
              >
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleMoveAnchor(1)} aria-label="Next period">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {view !== 'day' && (
            <div className="hidden grid-cols-7 border-b surface-divider bg-[color:var(--surface-muted)] lg:grid">
              {WEEKDAYS.map(day => (
                <div key={day} className="px-2 py-2 text-center text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  {day}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="hidden overflow-hidden lg:block">
        <div className={`grid ${view === 'day' ? 'grid-cols-1' : 'grid-cols-7'}`}>
          {calendarDays.map(({ date, day }) => {
            const cellDate = getLocalDate(date);
            const visibleLimit = view === 'month' ? 4 : view === 'week' ? 10 : 24;
            const visibleTransactions = day?.transactions.slice(0, visibleLimit) ?? [];
            const hiddenTransactions = day?.transactions.slice(visibleLimit) ?? [];
            const isToday = date === todayIso;
            const isSelected = date === selectedDate;

            return (
              <div
                key={date}
                ref={date === currentWeekStartIso ? currentWeekRef : null}
                onClick={() => handleSelectDate(date)}
                className={`${view === 'day' ? 'min-h-[360px] rounded-[18px] border' : view === 'week' ? 'min-h-[360px] border-b border-r' : 'min-h-[134px] border-b border-r'} cursor-pointer border-[color:var(--line)] p-2 transition ${
                  day ? 'bg-[color:var(--surface)]' : 'bg-[color:var(--surface-muted)]/55'
                } ${isSelected && view !== 'day' ? 'bg-[color:var(--accent-soft)]/35 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]' : 'hover:bg-[color:var(--surface-muted)]/70'}`}
                style={date === currentWeekStartIso ? { scrollMarginTop: '260px' } : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-bold tabular-nums ${
                      isToday
                        ? 'bg-red-500 text-white'
                        : isSelected
                          ? 'border border-[color:var(--accent)] text-[color:var(--accent)]'
                          : day
                            ? 'text-[color:var(--text)]'
                            : 'text-[color:var(--muted)]'
                    }`}>
                      {formatInTimeZone(cellDate, 'America/Chicago', 'd')}
                    </p>
                    {day?.isHighest && (
                      <span className="hidden rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-green-700 xl:inline-flex">
                        High
                      </span>
                    )}
                    {day?.isLowest && (
                      <span className="hidden rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-red-700 xl:inline-flex">
                        Low
                      </span>
                    )}
                  </div>
                  {day && (
                    <span className={`text-[11px] font-bold tabular-nums ${balanceTextClass(day.balance)}`}>
                      {formatCurrency(day.balance)}
                    </span>
                  )}
                </div>

                {day && visibleTransactions.length > 0 ? (
                  <div className={view === 'day' ? 'mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3' : 'mt-2 space-y-1'}>
                    {visibleTransactions.map(transaction => (
                      <div
                        key={`${date}-${transaction.id}`}
                        title={`${transaction.name} • ${transaction.category}${!affectsBalance(transaction) ? ' • Excluded from balance' : ''}`}
                        className={view === 'day'
                          ? 'flex min-h-[58px] min-w-0 items-center justify-between gap-3 rounded-[14px] border border-[color:var(--line)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm'
                          : 'flex min-w-0 items-center justify-between gap-1 rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-muted)] px-1.5 py-1 text-[11px]'
                        }
                      >
                        <div className="min-w-0">
                          <span className="block truncate font-semibold text-[color:var(--text)]">
                            {transaction.name}
                          </span>
                          {view === 'day' && (
                            <span className="mt-0.5 block truncate text-xs text-[color:var(--muted)]">
                              {transaction.category}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {!affectsBalance(transaction) && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="Excluded from balance" />
                          )}
                          <span className="font-bold tabular-nums text-[color:var(--muted)]">
                            {formatSignedCurrency(transaction.amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {hiddenTransactions.length > 0 && (
                      <button
                        type="button"
                        title={hiddenTransactions
                          .map(transaction => `${transaction.name}: ${formatSignedCurrency(transaction.amount)}${!affectsBalance(transaction) ? ' (excluded)' : ''}`)
                          .join('\n')}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedDate(date);
                          setAnchor(getLocalDate(date));
                          setView('day');
                        }}
                        className={view === 'day'
                          ? 'rounded-[14px] border border-dashed border-[color:var(--line-strong)] px-3 py-2 text-center text-sm font-semibold text-[color:var(--muted)] transition hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--text)]'
                          : 'w-full rounded-md px-2 py-1 text-center text-[11px] font-semibold text-[color:var(--muted)] transition hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--text)]'
                        }
                      >
                        +{hiddenTransactions.length} more
                      </button>
                    )}
                  </div>
                ) : day ? (
                  <p className="mt-7 text-center text-[11px] text-[color:var(--muted)]">No transactions</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="space-y-3 lg:hidden">
        {filteredDays.map((day, index) => (
          <Card
            key={day.date}
            className={`w-full overflow-hidden border-l-4
              ${day.isHighest ? 'border-l-green-500' : ''}
              ${day.isLowest ? 'border-l-red-500' : ''}
              ${!day.isHighest && !day.isLowest ? 'border-l-[color:var(--accent)]/30' : ''}
            `}
          >
            <div className="border-b surface-divider px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="display-copy truncate text-[1.45rem] leading-tight text-[color:var(--text)]">
                    {formatDate(day.date)}
                  </h2>
                  {day.isHighest && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-300">
                      <TrendingUp size={12} className="mr-1" /> High
                    </span>
                  )}
                  {day.isLowest && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      <TrendingDown size={12} className="mr-1" /> Low
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className={`display-copy text-[1.35rem] leading-tight ${balanceTextClass(day.balance)}`}>
                    {formatCurrency(day.balance)}
                  </div>
                  {index > 0 && (
                    <div className={`mt-0.5 flex items-center justify-end text-xs ${
                      getBalanceChange(day, index) >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {getBalanceChange(day, index) >= 0 ? (
                        <>
                          <ArrowUpRight size={14} className="mr-1" />
                          +{formatCurrency(getBalanceChange(day, index))}
                        </>
                      ) : (
                        <>
                          <ArrowDownRight size={14} className="mr-1" />
                          {formatCurrency(getBalanceChange(day, index))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <CardContent className="p-3 sm:p-4">
              {day.transactions.length > 0 ? (
                <ul className="divide-y surface-divider overflow-hidden rounded-[14px] border border-[color:var(--line)] bg-[color:var(--surface-muted)]">
                  {day.transactions.map(transaction => (
                    <li key={`${day.date}-${transaction.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate font-medium text-[color:var(--text)]">{transaction.name}</span>
                        <span className="hidden max-w-[170px] truncate text-xs text-[color:var(--muted)] sm:inline">
                          {transaction.category}
                        </span>
                        {!affectsBalance(transaction) && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="Excluded from balance" />
                        )}
                      </div>
                      <span className="flex-shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-[color:var(--muted)]">
                        {formatSignedCurrency(transaction.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-[14px] border border-[color:var(--line)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm text-[color:var(--muted)]">No transactions on this day.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
