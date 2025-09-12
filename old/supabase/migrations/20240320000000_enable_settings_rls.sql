-- Enable RLS on settings table
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to read settings
CREATE POLICY "Allow authenticated users to read settings"
ON public.settings
FOR SELECT
TO authenticated
USING (true);

-- Create policy for authenticated users to update settings
CREATE POLICY "Allow authenticated users to update settings"
ON public.settings
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Create policy for authenticated users to insert settings
CREATE POLICY "Allow authenticated users to insert settings"
ON public.settings
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create policy for authenticated users to delete settings
CREATE POLICY "Allow authenticated users to delete settings"
ON public.settings
FOR DELETE
TO authenticated
USING (true); 