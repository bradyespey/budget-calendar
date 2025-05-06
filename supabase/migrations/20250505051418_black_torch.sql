/*
  # Create plaid_tokens table

  1. New Tables
    - `plaid_tokens`
      - `id` (text, primary key) - identifier for the token (e.g., 'chase')
      - `access_token` (text) - Plaid access token
      - `updated_at` (timestamp with time zone) - Last update timestamp
  
  2. Security
    - Enable RLS on `plaid_tokens` table
    - Add policy for authenticated users to read tokens
*/

CREATE TABLE IF NOT EXISTS plaid_tokens (
  id text PRIMARY KEY,
  access_token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plaid_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read plaid tokens"
  ON plaid_tokens
  FOR SELECT
  TO authenticated
  USING (true);