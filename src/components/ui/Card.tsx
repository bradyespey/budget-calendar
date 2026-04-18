//src/components/ui/Card.tsx

import clsx from 'clsx'

export interface CardProps {
  children: React.ReactNode
  className?: string
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => (
  <div
    className={clsx('surface-card transition-transform duration-200', className)}
  >
    {children}
  </div>
)

export const CardHeader: React.FC<CardProps> = ({ children, className = '' }) => (
  <div className={clsx('border-b px-5 py-5 sm:px-6 surface-divider', className)}>
    {children}
  </div>
)

export const CardTitle: React.FC<CardProps> = ({ children, className = '' }) => (
  <h3 className={clsx('display-copy text-[1.45rem] font-semibold text-[color:var(--text)]', className)}>
    {children}
  </h3>
)

export const CardDescription: React.FC<CardProps> = ({ children, className = '' }) => (
  <p className={clsx('mt-2 text-sm leading-6 text-[color:var(--muted)]', className)}>
    {children}
  </p>
)

export const CardContent: React.FC<CardProps> = ({ children, className = '' }) => (
  <div className={clsx('p-5 sm:p-6', className)}>
    {children}
  </div>
)

export const CardFooter: React.FC<CardProps> = ({ children, className = '' }) => (
  <div className={clsx('border-t p-5 sm:p-6 surface-divider', className)}>
    {children}
  </div>
)
