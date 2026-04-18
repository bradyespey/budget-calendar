//src/components/ui/PageHeader.tsx

import clsx from 'clsx';
import { ReactNode } from 'react';
import { PageHelpTooltip } from './PageHelpTooltip';

interface HelpSection {
  title: string;
  items: string[];
}

interface PageHeaderProps {
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
  eyebrow,
  title,
  subtitle,
  description,
  helpSections,
  actions,
  stats,
}: PageHeaderProps) {
  return (
    <div className="relative z-20 mb-6 sm:mb-8">
      <div className="surface-card relative z-20 overflow-visible p-5 sm:p-6 lg:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
            <h1 className="display-copy overflow-visible pb-3 text-[2.35rem] leading-[1.24] sm:text-[2.9rem] text-[color:var(--text)]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 text-sm font-semibold text-[color:var(--accent)]">
                {subtitle}
              </p>
            )}
            {description && (
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--muted)] sm:text-base">
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
              'mt-6 grid gap-3 sm:grid-cols-2',
              stats.length >= 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'
            )}
          >
            {stats.map((stat) => (
              <div
                key={`${stat.label}-${stat.value}`}
                className={clsx(
                  'stat-card border px-3 py-3.5',
                  toneStyles[stat.tone || 'neutral']
                )}
              >
                <p className="eyebrow mb-2 text-current opacity-80">{stat.label}</p>
                <p className="display-copy text-[1.45rem] leading-[1.18] text-[color:var(--text)]">{stat.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
