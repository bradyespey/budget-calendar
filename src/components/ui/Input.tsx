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
        <label htmlFor={props.id} className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={[
          'w-full rounded-2xl border px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-all',
          'border-[color:var(--line-strong)] bg-[color:var(--surface)] text-[color:var(--text)]',
          'focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]',
          'placeholder:text-slate-400 dark:placeholder:text-slate-500',
          'disabled:cursor-not-allowed disabled:opacity-60',
          props.type === 'date' ? 'dark:[color-scheme:dark]' : '',
          error
            ? 'border-[color:var(--danger)] focus:border-[color:var(--danger)] focus:ring-[color:var(--danger-soft)]'
            : '',
          className
        ].join(' ')}
        {...props}
      />
      {error && <p className="mt-2 text-sm text-[color:var(--danger)]">{error}</p>}
      {!error && helperText && (
        <p className="mt-2 text-sm text-[color:var(--muted)]">{helperText}</p>
      )}
    </div>
  )
)
