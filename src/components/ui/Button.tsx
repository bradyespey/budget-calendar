//src/components/ui/Button.tsx

import clsx from 'clsx'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'default' | 'destructive'
type ButtonSize    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:   ButtonVariant
  size?:      ButtonSize
  isLoading?: boolean
  leftIcon?:  React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant   = 'primary',
  size      = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const normalizedVariant =
    variant === 'default'
      ? 'primary'
      : variant === 'destructive'
        ? 'danger'
        : variant

  const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-full border font-semibold tracking-[0.01em] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)] disabled:pointer-events-none disabled:opacity-50'

  const variantStyles: Record<Exclude<ButtonVariant, 'default' | 'destructive'>, string> = {
    primary: 'border-transparent bg-[color:var(--accent)] text-white shadow-[0_18px_38px_-24px_rgba(47,102,208,0.9)] hover:bg-[color:var(--accent-strong)]',
    secondary: 'border-transparent bg-[color:var(--surface-muted)] text-[color:var(--text)] hover:bg-[color:var(--surface-hover)]',
    outline: 'border-[color:var(--line-strong)] bg-[color:var(--surface)] text-[color:var(--text)] hover:bg-[color:var(--surface-hover)]',
    danger: 'border-transparent bg-[color:var(--danger)] text-white hover:bg-[color:var(--danger-strong)]',
    ghost: 'border-transparent bg-transparent text-[color:var(--muted)] hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--text)]',
  }

  const sizeStyles: Record<ButtonSize,string> = {
    sm: 'h-9 px-4 text-xs',
    md: 'h-11 px-5 text-sm',
    lg: 'h-12 px-6 text-sm sm:text-base',
  }

  const spinner = (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )

  return (
    <button
      disabled={disabled || isLoading}
      className={clsx(
        baseStyles,
        variantStyles[normalizedVariant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {isLoading && spinner}
      {!isLoading && leftIcon  && <span className="mr-2">{leftIcon}</span>}
      {children}
      {!isLoading && rightIcon && <span className="ml-2">{rightIcon}</span>}
    </button>
  )
}
