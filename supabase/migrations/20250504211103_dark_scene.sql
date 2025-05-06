/*
  # Update bill constraints to handle zero amounts

  1. Changes
    - Remove amount_not_zero constraint
    - Update valid categories to match import data
    - Add subscription types constraint
*/

-- Drop existing constraints
ALTER TABLE bills DROP CONSTRAINT IF EXISTS valid_category;
ALTER TABLE bills DROP CONSTRAINT IF EXISTS valid_frequency;
ALTER TABLE bills DROP CONSTRAINT IF EXISTS valid_owner;
ALTER TABLE bills DROP CONSTRAINT IF EXISTS amount_not_zero;

-- Add updated constraints
ALTER TABLE bills 
ADD CONSTRAINT valid_category 
CHECK (category IN (
  'auto',
  'cloud storage',
  'counseling',
  'credit card',
  'fitness',
  'food & drinks',
  'games',
  'golf',
  'health',
  'house',
  'insurance',
  'job search',
  'mobile phone',
  'other',
  'paycheck',
  'subscription',
  'transfer',
  'travel',
  'utilities'
));

ALTER TABLE bills 
ADD CONSTRAINT valid_frequency 
CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly', 'one-time'));

ALTER TABLE bills 
ADD CONSTRAINT valid_owner
CHECK (owner IN ('Both', 'Brady', 'Jenny'));