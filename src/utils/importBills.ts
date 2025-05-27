//src/utils/importBills.ts

import { parse } from 'date-fns'
import type { Bill } from '../types'
import { importBills } from '../api/bills'

// ── Parse CSV and import bills ───────────────────────────────────────────────
export async function importBillsFromCSV(csvData: string): Promise<{ total: number; imported: number }> {
  const lines = csvData.split('\n')
  const headers = lines.shift()!.split(',').map(h => h.trim())

  const bills: Omit<Bill, 'id'>[] = []
  const totalRows = lines.filter(line => line.trim()).length

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // ── Split row on commas outside quotes ─────────────────────────────────
    const row: string[] = []
    let inQuotes = false
    let cur = ''
    for (const ch of trimmed) {
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        row.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
    row.push(cur)

    // ── Map header → value ────────────────────────────────────────────────
    const data: Record<string, string> = {}
    headers.forEach((h, i) => {
      data[h] = (row[i] ?? '').trim().replace(/^"(.*)"$/, '$1')
    })

    // ── Skip incomplete rows ───────────────────────────────────────────────
    if (!data.Name || !data.Category) continue

    // ── Parse amount ──────────────────────────────────────────────────────
    const amount = parseFloat(data.Amount.replace(/[$,]/g, '')) || 0

    // ── Parse dates ──────────────────────────────────────────────────────
    let start_date = new Date().toISOString()
    try {
      start_date = parse(data['Start Date'], 'M/d/yyyy', new Date()).toISOString()
    } catch {
      console.warn(`Invalid start date for "${data.Name}", using today`)
    }

    let end_date: string | undefined
    if (data['End Date']) {
      try {
        end_date = parse(data['End Date'], 'M/d/yyyy', new Date()).toISOString()
      } catch {
        console.warn(`Invalid end date for "${data.Name}", skipping`)
      }
    }

    // ── Normalize frequency & category ────────────────────────────────────
    let frequency = (data.Frequency?.toLowerCase() || 'one-time')
      .replace(/years?/, 'yearly')
      .replace(/months?/, 'monthly')
      .replace(/weeks?/, 'weekly')
      .replace(/days?/, 'daily')

    const category = data.Category.toLowerCase()

    // ── Build bill entry ──────────────────────────────────────────────────
    bills.push({
      name:        data.Name,
      category,
      amount,
      frequency:   frequency as Bill['frequency'],
      repeats_every: parseInt(data['Repeats Every'] || '1', 10) || 1,
      start_date,
      end_date,
      owner:       data.Owner as Bill['owner'],
      note:        data.Note
    })
  }

  if (bills.length === 0) {
    throw new Error('No valid bills found in provided CSV')
  }

  // ── Send to API ────────────────────────────────────────────────────────
  await importBills(bills)
  return { total: totalRows, imported: bills.length }
}