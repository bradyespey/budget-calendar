import { supabase } from '../lib/supabase';
import { Projection } from '../types';
import { format, addDays } from 'date-fns';

export async function getProjections(days = 30) {
  const today = new Date();
  const endDate = addDays(today, days);
  
  const { data, error } = await supabase
    .from('projections')
    .select('*')
    .gte('proj_date', format(today, 'yyyy-MM-dd'))
    .lte('proj_date', format(endDate, 'yyyy-MM-dd'))
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
  const { data, error } = await supabase.functions.invoke('recalculate-projections', {
    method: 'POST',
  });

  if (error) {
    console.error('Error triggering recalculation:', error);
    throw error;
  }

  return data;
}