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
    <div className="relative">
      {/* Help Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
        aria-label="Help"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {/* Tooltip Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
              {/* Tooltip Content - Compact like SportsHub */}
              <div className={`${useFixedPosition ? 'fixed top-16 right-4' : 'fixed sm:absolute right-4 sm:right-0 top-16 sm:top-8'} z-50 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-gray-700 bg-gray-800 dark:bg-gray-900 shadow-xl max-h-[80vh] overflow-y-auto`}>
            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="sticky top-0 right-0 float-right m-1.5 text-gray-400 hover:text-gray-300 z-10 bg-gray-800 dark:bg-gray-900 rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            {/* Content */}
            <div className="p-3 pb-4 pt-2 space-y-1.5 clear-both">
              {sections.map((section, index) => (
                <div key={index}>
                  {index > 0 && <div className="border-t border-gray-700 my-1.5" />}
                  <div className="space-y-0.5">
                    <p className="font-semibold text-xs text-white mb-1">{section.title}</p>
                    <div className="text-xs text-gray-300 space-y-0">
                      {section.items.map((item, itemIndex) => (
                        <p key={itemIndex} className="leading-tight py-0.5">• {item}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

