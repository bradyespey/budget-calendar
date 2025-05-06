import { parse } from 'date-fns';
import { Bill } from '../types';
import { importBills } from '../api/bills';

// Function to parse CSV data and import bills
export async function importBillsFromCSV(csvData: string) {
  // Parse CSV data
  const lines = csvData.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const bills: Omit<Bill, 'id'>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted values correctly
    const row: string[] = [];
    let inQuotes = false;
    let currentValue = '';

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(currentValue);
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    row.push(currentValue);

    // Create object from row
    const rowData: Record<string, string> = {};
    headers.forEach((header, index) => {
      rowData[header] = row[index]?.trim().replace(/^"(.*)"$/, '$1') ?? '';
    });
    
    // Skip empty rows
    if (!rowData.Name || !rowData.Category) continue;
    
    // Parse amount - remove $ and , then convert to number
    const amount = parseFloat(rowData.Amount.replace(/[$,]/g, '')) || 0;
    
    // Parse date
    let startDate = new Date();
    try {
      startDate = parse(rowData['Start Date'], 'M/d/yyyy', new Date());
    } catch (error) {
      console.warn(`Invalid date format for ${rowData.Name}, using current date`);
    }
    
    // Parse end date if exists
    let endDate: string | undefined;
    if (rowData['End Date']) {
      try {
        endDate = parse(rowData['End Date'], 'M/d/yyyy', new Date()).toISOString();
      } catch (error) {
        console.warn(`Invalid end date format for ${rowData.Name}, skipping end date`);
      }
    }
    
    // Normalize frequency
    let frequency = rowData.Frequency?.toLowerCase() || 'one-time';
    if (frequency === 'years') frequency = 'yearly';
    if (frequency === 'months') frequency = 'monthly';
    if (frequency === 'weeks') frequency = 'weekly';
    if (frequency === 'days') frequency = 'daily';
    if (frequency === 'one-time') frequency = 'one-time';

    // Normalize category
    let category = rowData.Category.toLowerCase();
    if (category === 'food & drinks') category = 'food & drinks';
    if (category === 'cloud storage') category = 'cloud storage';
    if (category === 'credit card') category = 'credit card';
    if (category === 'job search') category = 'job search';
    if (category === 'mobile phone') category = 'mobile phone';
    
    // Add bill
    bills.push({
      name: rowData.Name,
      category: category,
      amount: amount,
      frequency: frequency as Bill['frequency'],
      repeats_every: parseInt(rowData['Repeats Every'] || '1'),
      start_date: startDate.toISOString(),
      end_date: endDate,
      owner: rowData.Owner as Bill['owner'],
      note: rowData.Note
    });
  }
  
  if (bills.length === 0) {
    throw new Error('No valid bills found in CSV');
  }

  // Import bills to database
  await importBills(bills);
  
  return bills.length;
}