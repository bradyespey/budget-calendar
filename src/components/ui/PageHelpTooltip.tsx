//src/components/ui/PageHelpTooltip.tsx

import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface HelpSection {
  title: string;
  items: string[];
}

interface PageHelpTooltipProps {
  sections: HelpSection[];
  useFixedPosition?: boolean;
}

export function PageHelpTooltip({ sections, useFixedPosition = false }: PageHelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      {/* Help Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line-strong)] bg-[color:var(--surface)] text-[color:var(--muted)] transition hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
        aria-label="Help"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {/* Tooltip Panel */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          <div
            className={`${
              useFixedPosition
                ? 'fixed right-4 top-20 sm:absolute sm:right-0 sm:top-[calc(100%+0.75rem)]'
                : 'fixed right-4 top-20 sm:absolute sm:right-0 sm:top-[calc(100%+0.75rem)]'
            } z-[120] w-[min(21rem,calc(100vw-2rem))] overflow-hidden surface-card`}
          >
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--surface-muted)] text-[color:var(--muted)] transition hover:text-[color:var(--text)]"
              aria-label="Close help"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div className="max-h-[calc(100vh-7rem)] overflow-y-auto px-5 pb-5 pt-5">
              <div className="space-y-4 pr-6">
                {sections.map((section, index) => (
                  <div key={index}>
                    {index > 0 && <div className="mb-4 border-t surface-divider" />}
                    <div className="space-y-2">
                      <p className="eyebrow">{section.title}</p>
                      <div className="space-y-1.5 text-sm leading-7 text-[color:var(--muted)]">
                        {section.items.map((item, itemIndex) => (
                          <p key={itemIndex} className="leading-7">• {item}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
