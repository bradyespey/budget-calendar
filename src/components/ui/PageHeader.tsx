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
  return (
    <div className={clsx('relative z-20 mb-5', className)}>
      <div className="surface-panel relative z-20 overflow-visible p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
            <h1 className="display-copy overflow-visible pb-1 text-[2.3rem] leading-[1.16] sm:text-[2.9rem] text-[color:var(--text)]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-xs font-semibold text-[color:var(--accent)]">
                {subtitle}
              </p>
            )}
            {description && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
                {description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 self-start">
            {helpSections && <PageHelpTooltip sections={helpSections} useFixedPosition />}
            {actions}
          </div>
        </div>

        {stats && stats.length > 0 && (
          <div
            className={clsx(
              'mt-5 grid gap-2 sm:grid-cols-2',
              stats.length >= 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'
            )}
          >
            {stats.map((stat) => (
              <div
                key={`${stat.label}-${stat.value}`}
                className={clsx(
                  'flex min-h-[92px] flex-col items-center justify-center rounded-[13px] border px-3 py-3 text-center',
                  toneStyles[stat.tone || 'neutral']
                )}
              >
                <p className="eyebrow mb-2 text-[0.8rem] text-current opacity-90">{stat.label}</p>
                <p className="text-[1.35rem] font-bold leading-[1.1] text-[color:var(--text)]">{stat.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
