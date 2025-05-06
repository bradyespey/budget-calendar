/*
  # Create initial schema for Budget Calendar

  1. New Tables
    - `bills` - Stores recurring bills and income sources
      - `id` (uuid, primary key)
      - `name` (text)
      - `category` (text)
      - `amount` (numeric)
      - `frequency` (text)
      - `repeats_every` (int)
      - `start_date` (date)
      - `end_date` (date, nullable)
      - `owner` (text, nullable)
      - `note` (text, nullable)
    
    - `accounts` - Stores Monarch Money account information
      - `id` (text, primary key)
      - `display_name` (text)
      - `last_balance` (numeric)
      - `last_synced` (timestamptz)
    
    - `projections` - Stores daily balance projections
      - `proj_date` (date, primary key)
      - `projected_balance` (numeric)
      - `lowest` (boolean)
      - `highest` (boolean)
  
  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users only
*/

-- Create bills table
CREATE TABLE IF NOT EXISTS bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  amount numeric NOT NULL,
  frequency text NOT NULL,
  repeats_every int NOT NULL DEFAULT 1,
  start_date date NOT NULL,
  end_date date,
  owner text,
  note text
);

-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  last_balance numeric NOT NULL,
  last_synced timestamptz NOT NULL
);

-- Create projections table
CREATE TABLE IF NOT EXISTS projections (
  proj_date date PRIMARY KEY,
  projected_balance numeric NOT NULL,
  lowest boolean DEFAULT false,
  highest boolean DEFAULT false
);

-- Enable Row Level Security
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE projections ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users only
CREATE POLICY "Allow authenticated users to read bills"
  ON bills
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert bills"
  ON bills
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update bills"
  ON bills
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete bills"
  ON bills
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read accounts"
  ON accounts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read projections"
  ON projections
  FOR SELECT
  TO authenticated
  USING (true);