//src/components/ui/PageHeader.tsx

import { ReactNode } from 'react';
import { PageHelpTooltip } from './PageHelpTooltip';

interface HelpSection {
  title: string;
  items: string[];
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  helpSections?: HelpSection[];
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, helpSections, actions }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 relative">
          {helpSections && <PageHelpTooltip sections={helpSections} />}
          {actions}
        </div>
      </div>
    </div>
  );
}

