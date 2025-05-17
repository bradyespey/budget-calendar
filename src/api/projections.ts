//src/api/projections.ts

import { supabase } from '../lib/supabase';
import { Projection } from '../types';
import { format } from 'date-fns';

export async function getProjections() {
  const today = new Date();
  const { data, error } = await supabase
    .from('projections')
    .select('*')
    .gte('proj_date', format(today, 'yyyy-MM-dd'))
    .order('proj_date', { ascending: true });
    
  if (error) {
    console.error('Error fetching projections:', error);
    throw error;
  }
  
  return data as Projection[];
}

export async function getHighLowProjections() {
  const { data, error } = await supabase
    .from('projections')
    .select('*')
    .or('lowest.eq.true,highest.eq.true')
    .order('proj_date', { ascending: true });
    
  if (error) {
    console.error('Error fetching high/low projections:', error);
    throw error;
  }
  
  const highestPoint = data.find(p => p.highest);
  const lowestPoint = data.find(p => p.lowest);
  
  return { highest: highestPoint, lowest: lowestPoint };
}

export async function triggerManualRecalculation() {
  const session = await supabase.auth.getSession();
  console.log('Session:', session); // Debug log

  if (!session.data.session) {
    throw new Error("No active session");
  }

  const token = session.data.session.access_token;
  console.log('Token:', token ? 'Present' : 'Missing'); // Debug log

  const { data, error } = await supabase.functions.invoke('budget-projection', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (error) {
    console.error('Error triggering recalculation:', error);
    throw error;
  }

  return data;
}