//src/components/ui/Input.tsx

import { forwardRef } from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:      string
  error?:      string
  helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, helperText, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label htmlFor={props.id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={[
          'w-full rounded-md border py-2 px-3 shadow-sm transition-all',
          'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
          'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
          'disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:opacity-70',
          // Custom styling for date inputs to make calendar icon white in dark mode
          props.type === 'date' ? 'dark:[color-scheme:dark]' : '',
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
            : '',
          className
        ].join(' ')}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-500">{error}</p>}
      {!error && helperText && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
      )}
    </div>
  )
)