//src/components/ui/PageHeader.tsx

import clsx from 'clsx';
import { ReactNode } from 'react';
import { PageHelpTooltip } from './PageHelpTooltip';

interface HelpSection {
  title: string;
  items: string[];
}

interface PageHeaderProps {
  className?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  description?: string;
  helpSections?: HelpSection[];
  actions?: ReactNode;
  stats?: Array<{
    label: string;
    value: string;
    tone?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral' | 'violet';
  }>;
}

const toneStyles = {
  accent: 'border-[color:var(--accent-soft)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]',
  success: 'border-[color:var(--success-soft)] bg-[color:var(--success-soft)] text-[color:var(--success)]',
  warning: 'border-[color:var(--warning-soft)] bg-[color:var(--warning-soft)] text-[color:var(--warning)]',
  danger: 'border-[color:var(--danger-soft)] bg-[color:var(--danger-soft)] text-[color:var(--danger)]',
  neutral: 'border-[color:var(--line)] bg-[color:var(--surface-muted)] text-[color:var(--muted)]',
  violet: 'border-[color:var(--violet-soft)] bg-[color:var(--violet-soft)] text-[color:var(--violet)]',
}

export function PageHeader({
  className,
  eyebrow,
  title,
  subtitle,
  description,
  helpSections,
  actions,
  stats,
}: PageHeaderProps) {
  const hasStats = Boolean(stats?.length)
  const hasSideMeta = Boolean(subtitle || helpSections || actions)

  return (
    <div className={clsx('relative z-20 mb-4', className)}>
      <div className="surface-panel relative z-20 overflow-visible px-4 py-3.5 sm:px-5">
        <div
          className={clsx(
            'flex flex-col gap-4',
            hasStats
              ? 'xl:grid xl:grid-cols-[minmax(190px,auto)_1fr_minmax(190px,auto)] xl:items-center xl:gap-6'
              : 'xl:flex-row xl:items-center xl:justify-between xl:gap-6'
          )}
        >
          <div className="min-w-0 shrink-0">
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            <h1 className="display-copy overflow-visible pb-0.5 text-[1.85rem] leading-[1.02] sm:text-[2.15rem] text-[color:var(--text)]">
              {title}
            </h1>
            {description && (
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
                {description}
              </p>
            )}
          </div>
          {hasStats && (
            <div className="flex min-w-0 flex-wrap items-center gap-3 xl:justify-center">
              {stats?.map((stat) => (
                <div
                  key={`${stat.label}-${stat.value}`}
                  className={clsx(
                    'inline-flex min-h-0 items-center gap-2.5 rounded-full border px-3.5 py-1.5',
                    toneStyles[stat.tone || 'neutral']
                  )}
                >
                  <p className="eyebrow text-[0.58rem] text-current opacity-90">{stat.label}</p>
                  <p className="whitespace-nowrap text-sm font-bold leading-tight text-[color:var(--text)]">{stat.value}</p>
                </div>
              ))}
            </div>
          )}
          {hasSideMeta && (
            <div className="flex min-w-0 flex-wrap items-center gap-3 xl:justify-end">
              {subtitle && (
                <p className="rounded-full border border-[color:var(--line)] bg-[color:var(--surface-muted)] px-3.5 py-1.5 text-xs font-semibold text-[color:var(--accent)]">
                  {subtitle}
                </p>
              )}
              {helpSections && <PageHelpTooltip sections={helpSections} useFixedPosition />}
              {actions}
            </div>
          )}
          </div>
      </div>
    </div>
  );
}
