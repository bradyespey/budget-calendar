//src/pages/SettingsPage.tsx

import React, { useState, useRef } from 'react'
import { Calculator, Calendar, Upload } from 'lucide-react'
import { Button } from '../components/ui/Button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/Card'
import { triggerManualRecalculation } from '../api/projections'
import { refreshChaseBalanceInDb } from '../api/accounts'
import { useBalance } from '../context/BalanceContext'

export function SettingsPage() {
  const [recalculating, setRecalculating] = useState(false)
  const [syncingCalendar, setSyncingCalendar] = useState(false)
  const [updatingBalance, setUpdatingBalance] = useState(false)
  const [importing, setImporting] = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // <-- NEW: pull in context setters -->
  const { setBalance, setLastSync } = useBalance()

  const handleUpdateBalance = async () => {
    try {
      setUpdatingBalance(true)
      setError(null)

      const balance = await refreshChaseBalanceInDb()
      // <-- NEW: update context -->
      setBalance(balance)
      setLastSync(new Date())

      setLastAction(`Chase balance updated: $${balance.toLocaleString()}`)
    } catch (err: any) {
      console.error(err)
      setError(`Error updating balance: ${err.message}`)
    } finally {
      setUpdatingBalance(false)
    }
  }

  const handleRecalculate = async () => {
    try {
      setRecalculating(true)
      setError(null)
      await triggerManualRecalculation()
      setLastAction('Budget projections successfully recalculated.')
    } catch (err: any) {
      console.error('Error during recalculation:', err)
      setError('Error recalculating projections. Please try again.')
    } finally {
      setRecalculating(false)
    }
  }

  const handleSyncCalendar = async () => {
    try {
      setSyncingCalendar(true)
      setError(null)
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-calendar`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      )
      if (!res.ok) throw new Error('Failed to sync calendar')
      setLastAction('Calendar sync completed successfully.')
    } catch (err: any) {
      console.error('Error syncing calendar:', err)
      setError('Error syncing calendar. Please try again.')
    } finally {
      setSyncingCalendar(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setImporting(true)
      setError(null)
      // ... CSV import logic ...
      const text = await file.text()
      console.log('Imported CSV:', text)
      setLastAction('Successfully imported bills from CSV.')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: any) {
      console.error('Error importing CSV:', err)
      setError('Error importing CSV. Please check the file format and try again.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>

      {lastAction && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded-md mb-4">
          <p className="text-blue-700 dark:text-blue-400">{lastAction}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks for managing your budget data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleUpdateBalance}
              isLoading={updatingBalance}
              leftIcon={<Calculator size={16} />}
            >
              💰 Update Balance
            </Button>

            <Button
              onClick={handleRecalculate}
              isLoading={recalculating}
              leftIcon={<Calculator size={16} />}
            >
              📊 Recalculate
            </Button>

            <Button
              onClick={handleSyncCalendar}
              isLoading={syncingCalendar}
              leftIcon={<Calendar size={16} />}
            >
              📅 Sync Calendar
            </Button>
          </div>
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 mt-2">
              {error}
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Account refreshes and projections are automatically performed every
            night at 02:00 UTC. Only use these manual triggers if you need to
            refresh data immediately.
          </p>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import Bills from CSV</CardTitle>
          <CardDescription>
            The file should have columns: Name, Category, Amount, Frequency,
            Repeats Every, Start Date, End Date (optional), Owner, Note
            (optional).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            isLoading={importing}
            leftIcon={<Upload size={16} />}
          >
            📥 Import CSV
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}