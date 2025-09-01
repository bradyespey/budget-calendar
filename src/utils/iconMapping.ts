//src/utils/iconMapping.ts

export interface IconMapping {
  [key: string]: {
    iconUrl: string;
    iconType: 'brand' | 'category';
  };
}

// Brand icons mapping - maps transaction names to brand icons
export const BRAND_ICON_MAPPING: IconMapping = {
  // Streaming & Entertainment
  'netflix': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/netflix.svg',
    iconType: 'brand'
  },
  'disney plus': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/disneyplus.svg',
    iconType: 'brand'
  },
  'hulu': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/hulu.svg',
    iconType: 'brand'
  },
  'amazon prime': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazonprime.svg',
    iconType: 'brand'
  },
  'spotify': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/spotify.svg',
    iconType: 'brand'
  },
  'apple music': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/applemusic.svg',
    iconType: 'brand'
  },
  
  // Technology & Software
  '1password': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/1password.svg',
    iconType: 'brand'
  },
  'github': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/github.svg',
    iconType: 'brand'
  },
  'google': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/google.svg',
    iconType: 'brand'
  },
  'microsoft': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/microsoft.svg',
    iconType: 'brand'
  },
  'adobe': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/adobe.svg',
    iconType: 'brand'
  },
  'openai': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/openai.svg',
    iconType: 'brand'
  },
  
  // Cloud Storage
  'dropbox': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/dropbox.svg',
    iconType: 'brand'
  },
  'icloud': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/icloud.svg',
    iconType: 'brand'
  },
  'google drive': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/googledrive.svg',
    iconType: 'brand'
  },
  
  // Gaming
  'clash of clans': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/clashofclans.svg',
    iconType: 'brand'
  },
  'steam': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/steam.svg',
    iconType: 'brand'
  },
  'nintendo': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/nintendo.svg',
    iconType: 'brand'
  },
  'playstation': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/playstation.svg',
    iconType: 'brand'
  },
  'xbox': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/xbox.svg',
    iconType: 'brand'
  },
  
  // Shopping & E-commerce
  'amazon': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazon.svg',
    iconType: 'brand'
  },
  'target': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/target.svg',
    iconType: 'brand'
  },
  'walmart': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/walmart.svg',
    iconType: 'brand'
  },
  'costco': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/costco.svg',
    iconType: 'brand'
  },
  
  // Utilities & Services
  'att': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/att.svg',
    iconType: 'brand'
  },
  'verizon': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/verizon.svg',
    iconType: 'brand'
  },
  'tmobile': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/tmobile.svg',
    iconType: 'brand'
  },
  
  // Financial Services
  'chase': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/chase.svg',
    iconType: 'brand'
  },
  'american express': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/americanexpress.svg',
    iconType: 'brand'
  },
  'paypal': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/paypal.svg',
    iconType: 'brand'
  },
  'venmo': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/venmo.svg',
    iconType: 'brand'
  },
  
  // Food & Delivery
  'doordash': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/doordash.svg',
    iconType: 'brand'
  },
  'uber eats': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/ubereats.svg',
    iconType: 'brand'
  },
  'grubhub': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/grubhub.svg',
    iconType: 'brand'
  },
  'starbucks': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/starbucks.svg',
    iconType: 'brand'
  },
  'mcdonalds': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/mcdonalds.svg',
    iconType: 'brand'
  },
  
  // Fitness & Health
  'peloton': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/peloton.svg',
    iconType: 'brand'
  },
  'fitbit': {
    iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/fitbit.svg',
    iconType: 'brand'
  }
};

// Category fallback icons using Lucide icons
export const CATEGORY_ICON_MAPPING: IconMapping = {
  'auto': {
    iconUrl: '/icons/car.svg',
    iconType: 'category'
  },
  'food & drinks': {
    iconUrl: '/icons/utensils.svg',
    iconType: 'category'
  },
  'utilities': {
    iconUrl: '/icons/zap.svg',
    iconType: 'category'
  },
  'subscription': {
    iconUrl: '/icons/repeat.svg',
    iconType: 'category'
  },
  'house': {
    iconUrl: '/icons/home.svg',
    iconType: 'category'
  },
  'health': {
    iconUrl: '/icons/heart.svg',
    iconType: 'category'
  },
  'insurance': {
    iconUrl: '/icons/shield.svg',
    iconType: 'category'
  },
  'mobile phone': {
    iconUrl: '/icons/smartphone.svg',
    iconType: 'category'
  },
  'travel': {
    iconUrl: '/icons/plane.svg',
    iconType: 'category'
  },
  'fitness': {
    iconUrl: '/icons/dumbbell.svg',
    iconType: 'category'
  },
  'games': {
    iconUrl: '/icons/gamepad-2.svg',
    iconType: 'category'
  },
  'credit card': {
    iconUrl: '/icons/credit-card.svg',
    iconType: 'category'
  },
  'transfer': {
    iconUrl: '/icons/arrow-right-left.svg',
    iconType: 'category'
  },
  'paycheck': {
    iconUrl: '/icons/banknote.svg',
    iconType: 'category'
  },
  'counseling': {
    iconUrl: '/icons/brain.svg',
    iconType: 'category'
  },
  'cloud storage': {
    iconUrl: '/icons/cloud.svg',
    iconType: 'category'
  },
  'golf': {
    iconUrl: '/icons/trophy.svg',
    iconType: 'category'
  },
  'job search': {
    iconUrl: '/icons/briefcase.svg',
    iconType: 'category'
  },
  'other': {
    iconUrl: '/icons/circle.svg',
    iconType: 'category'
  }
};

/**
 * Attempts to find an icon for a transaction by name and category
 */
export function findTransactionIcon(transactionName: string, category: string): { iconUrl: string; iconType: 'brand' | 'category' } | null {
  const normalizedName = transactionName.toLowerCase().trim();
  
  // First, try exact brand match
  if (BRAND_ICON_MAPPING[normalizedName]) {
    return BRAND_ICON_MAPPING[normalizedName];
  }
  
  // Try partial brand match (for names like "Netflix - Monthly")
  for (const [brandName, iconData] of Object.entries(BRAND_ICON_MAPPING)) {
    if (normalizedName.includes(brandName)) {
      return iconData;
    }
  }
  
  // Fall back to category icon
  if (CATEGORY_ICON_MAPPING[category]) {
    return CATEGORY_ICON_MAPPING[category];
  }
  
  // Default fallback
  return CATEGORY_ICON_MAPPING['other'];
}

/**
 * Normalizes a transaction name for better brand matching
 */
export function normalizeTransactionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
