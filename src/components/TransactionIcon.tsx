//src/components/TransactionIcon.tsx

import React from 'react';
import { findTransactionIcon } from '../utils/iconMapping';

interface TransactionIconProps {
  transactionName: string;
  category: string;
  iconUrl?: string;
  iconType?: 'brand' | 'generated' | 'category' | 'custom';
  className?: string;
}

export function TransactionIcon({ 
  transactionName, 
  category, 
  iconUrl, 
  iconType,
  className = "w-8 h-8" 
}: TransactionIconProps) {
  // Use provided icon if available, otherwise find one
  const icon = iconUrl && iconType 
    ? { iconUrl, iconType }
    : findTransactionIcon(transactionName, category);

  if (!icon) {
      // Fallback to a simple circle
  return (
    <div className={`${className} rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center`}>
      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
        {transactionName.charAt(0).toUpperCase()}
      </span>
    </div>
  );
  }

  // Handle different icon types
  if (icon.iconType === 'brand') {
    // Brand icons from Simple Icons (SVG) - make them larger and more visible
    return (
      <div className={`${className} flex items-center justify-center bg-white dark:bg-white rounded-full p-1.5 shadow-md`}>
        <img 
          src={icon.iconUrl} 
          alt={`${transactionName} icon`}
          className="w-full h-full object-contain"
          style={{ 
            filter: 'brightness(1) saturate(1.3) contrast(1.1)',
            minWidth: '20px',
            minHeight: '20px'
          }}
          onError={(e) => {
            // Fallback to text if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `<span class="text-sm font-bold text-blue-600">${transactionName.charAt(0).toUpperCase()}</span>`;
              parent.className = `${className} flex items-center justify-center bg-blue-100 rounded-full border border-blue-200 shadow-md`;
            }
          }}
        />
      </div>
    );
  } else if (icon.iconType === 'generated' || icon.iconType === 'custom') {
    // AI-generated and custom icons - larger with better styling
    return (
      <div className={`${className} flex items-center justify-center rounded-full overflow-hidden shadow-md bg-white dark:bg-gray-100`}>
        <img 
          src={icon.iconUrl} 
          alt={`${transactionName} icon`}
          className="w-full h-full object-cover"
          style={{ 
            minWidth: '24px',
            minHeight: '24px'
          }}
          onError={(e) => {
            // Fallback to text if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `<span class="text-sm font-bold text-purple-600">${transactionName.charAt(0).toUpperCase()}</span>`;
              parent.className = `${className} flex items-center justify-center bg-purple-100 rounded-full border-2 border-purple-200 shadow-md`;
            }
          }}
        />
      </div>
    );
  } else {
    // Category icons (local SVG files) - add color based on category
    const categoryColors = {
      'auto': 'bg-red-100 dark:bg-red-900 border-red-200 dark:border-red-700 text-red-600 dark:text-red-400',
      'food & drinks': 'bg-orange-100 dark:bg-orange-900 border-orange-200 dark:border-orange-700 text-orange-600 dark:text-orange-400',
      'utilities': 'bg-yellow-100 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-700 text-yellow-600 dark:text-yellow-400',
      'subscription': 'bg-purple-100 dark:bg-purple-900 border-purple-200 dark:border-purple-700 text-purple-600 dark:text-purple-400',
      'house': 'bg-green-100 dark:bg-green-900 border-green-200 dark:border-green-700 text-green-600 dark:text-green-400',
      'health': 'bg-pink-100 dark:bg-pink-900 border-pink-200 dark:border-pink-700 text-pink-600 dark:text-pink-400',
      'insurance': 'bg-blue-100 dark:bg-blue-900 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400',
      'mobile phone': 'bg-indigo-100 dark:bg-indigo-900 border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400',
      'travel': 'bg-cyan-100 dark:bg-cyan-900 border-cyan-200 dark:border-cyan-700 text-cyan-600 dark:text-cyan-400',
      'fitness': 'bg-emerald-100 dark:bg-emerald-900 border-emerald-200 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400',
      'games': 'bg-violet-100 dark:bg-violet-900 border-violet-200 dark:border-violet-700 text-violet-600 dark:text-violet-400',
      'credit card': 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400',
      'transfer': 'bg-teal-100 dark:bg-teal-900 border-teal-200 dark:border-teal-700 text-teal-600 dark:text-teal-400',
      'paycheck': 'bg-lime-100 dark:bg-lime-900 border-lime-200 dark:border-lime-700 text-lime-600 dark:text-lime-400',
      'counseling': 'bg-rose-100 dark:bg-rose-900 border-rose-200 dark:border-rose-700 text-rose-600 dark:text-rose-400',
      'cloud storage': 'bg-sky-100 dark:bg-sky-900 border-sky-200 dark:border-sky-700 text-sky-600 dark:text-sky-400',
      'golf': 'bg-amber-100 dark:bg-amber-900 border-amber-200 dark:border-amber-700 text-amber-600 dark:text-amber-400',
      'job search': 'bg-stone-100 dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400',
      'other': 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
    };
    
    const colorClass = categoryColors[category as keyof typeof categoryColors] || categoryColors['other'];
    
    return (
      <div className={`${className} flex items-center justify-center rounded-full shadow-md ${colorClass}`}>
        <img 
          src={icon.iconUrl} 
          alt={`${category} icon`}
          className="w-5 h-5 object-contain"
          style={{ 
            filter: 'brightness(1.1) contrast(1.1)',
            minWidth: '20px',
            minHeight: '20px'
          }}
          onError={(e) => {
            // Fallback to text if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `<span class="text-sm font-bold">${transactionName.charAt(0).toUpperCase()}</span>`;
            }
          }}
        />
      </div>
    );
  }
}
