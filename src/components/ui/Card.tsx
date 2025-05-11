//src/components/ui/Card.tsx

export interface CardProps {
  children: React.ReactNode
  className?: string
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => (
  <div
    className={[
      'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
      'rounded-xl shadow-sm border border-gray-200 dark:border-gray-700',
      className
    ].join(' ')}
  >
    {children}
  </div>
)

export const CardHeader: React.FC<CardProps> = ({ children, className = '' }) => (
  <div className={['p-4 border-b border-gray-200 dark:border-gray-700', className].join(' ')}>
    {children}
  </div>
)

export const CardTitle: React.FC<CardProps> = ({ children, className = '' }) => (
  <h3 className={['font-semibold text-lg text-gray-900 dark:text-gray-100', className].join(' ')}>
    {children}
  </h3>
)

export const CardDescription: React.FC<CardProps> = ({ children, className = '' }) => (
  <p className={['text-sm text-gray-500 dark:text-gray-400 mt-1', className].join(' ')}>
    {children}
  </p>
)

export const CardContent: React.FC<CardProps> = ({ children, className = '' }) => (
  <div className={['p-4', className].join(' ')}>
    {children}
  </div>
)

export const CardFooter: React.FC<CardProps> = ({ children, className = '' }) => (
  <div className={['p-4 border-t border-gray-200 dark:border-gray-700', className].join(' ')}>
    {children}
  </div>
)