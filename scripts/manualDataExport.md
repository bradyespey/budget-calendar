# Manual Data Export from Supabase

Since RLS is blocking the migration script, here's how to manually export your data:

## Option 1: Direct SQL Export (Recommended)

Go to your Supabase SQL Editor and run these queries to export your data:

### 1. Export Bills
```sql
SELECT 
  id::text as id,
  name,
  category,
  amount,
  frequency,
  repeats_every,
  start_date::text as start_date,
  end_date::text as end_date,
  owner,
  note
FROM bills
ORDER BY name;
```

### 2. Export Settings  
```sql
SELECT 
  id,
  projection_days,
  balance_threshold,
  calendar_mode,
  manual_balance_override,
  last_projected_at::text as last_projected_at
FROM settings;
```

### 3. Export Accounts
```sql
SELECT 
  id,
  display_name,
  last_balance,
  last_synced::text as last_synced
FROM accounts
ORDER BY id;
```

## Option 2: Use Service Role Key

If you have a service role key (not anon key), add it to `.env`:
```env
VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

And run the migration with elevated permissions.

## Option 3: Temporarily Disable RLS

1. Go to Supabase Dashboard → Authentication → Policies
2. For `bills`, `settings`, `accounts` tables:
   - Temporarily disable RLS policies
   - Run migration
   - Re-enable policies

## Next Steps

Once you get the data, I'll create a script to import it directly into Firebase.
