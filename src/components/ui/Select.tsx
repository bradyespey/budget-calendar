//src/components/ui/Select.tsx

import { forwardRef } from 'react'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?:      string
  name?:       string
  error?:      string
  helperText?: string
  options:    { value: string; label: string }[]
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', label, error, helperText, options, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label htmlFor={props.id} className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
          {label}
        </label>
      )}
      <select
        ref={ref}
        className={[
          'w-full rounded-2xl border px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-all',
          'border-[color:var(--line-strong)] bg-[color:var(--surface)] text-[color:var(--text)]',
          'focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]',
          'disabled:cursor-not-allowed disabled:opacity-60',
          error
            ? 'border-[color:var(--danger)] focus:border-[color:var(--danger)] focus:ring-[color:var(--danger-soft)]'
            : '',
          className
        ].join(' ')}
        {...props}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="mt-2 text-sm text-[color:var(--danger)]">{error}</p>}
      {!error && helperText && (
        <p className="mt-2 text-sm text-[color:var(--muted)]">{helperText}</p>
      )}
    </div>
  )
)
