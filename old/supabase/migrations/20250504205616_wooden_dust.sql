/*
  # Add additional fields to bills table

  1. Changes
    - Add `owner` column to specify who owns the bill (Both, Brady, Jenny)
    - Add `note` column for additional information
    - Add `category` column with predefined categories
    - Add `amount` column validation to ensure it's not zero
    - Add `frequency` validation for allowed values
    - Add `repeats_every` validation for positive integers

  2. Security
    - Maintain existing RLS policies
*/

-- Add check constraint for amount
ALTER TABLE bills 
ADD CONSTRAINT amount_not_zero 
CHECK (amount != 0);

-- Add check constraint for frequency
ALTER TABLE bills 
ADD CONSTRAINT valid_frequency 
CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly', 'one-time'));

-- Add check constraint for repeats_every
ALTER TABLE bills 
ADD CONSTRAINT valid_repeats_every 
CHECK (repeats_every > 0);

-- Add check constraint for category
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

-- Add check constraint for owner
ALTER TABLE bills
ADD CONSTRAINT valid_owner
CHECK (owner IN ('Both', 'Brady', 'Jenny'));