import { Check, Monitor, Moon, Sun } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/DropdownMenu'
import { useTheme } from './ThemeProvider'

type ThemeOption = {
  value: 'light' | 'dark' | 'system'
  label: string
  icon: typeof Sun
}

const themeOptions: ThemeOption[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

interface ThemeToggleMenuProps {
  className?: string
  fullWidth?: boolean
  align?: 'start' | 'end'
}

export function ThemeToggleMenu({
  className = '',
  fullWidth = false,
  align = 'end',
}: ThemeToggleMenuProps) {
  const { theme, setTheme } = useTheme()

  const activeTheme = themeOptions.find((option) => option.value === theme) ?? themeOptions[2]
  const ActiveIcon = activeTheme.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={[
            'inline-flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--line-strong)] bg-[color:var(--surface)] text-[color:var(--muted)] transition hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]',
            fullWidth ? 'w-full justify-center' : '',
            className,
          ].join(' ')}
          aria-label="Change theme"
        >
          <ActiveIcon size={20} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        className="w-[180px] rounded-[18px] border-[color:var(--line-strong)] bg-[color:var(--surface-elevated)] p-2 shadow-[var(--shadow-crisp)] backdrop-blur-xl"
      >
        {themeOptions.map((option) => {
          const Icon = option.icon
          const isActive = option.value === theme

          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={`rounded-[14px] px-3 py-2.5 text-left ${
                isActive
                  ? 'bg-[color:var(--surface-hover)] text-[color:var(--text)]'
                  : 'text-[color:var(--text)]'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--surface-muted)] text-[color:var(--muted)]">
                  <Icon size={15} />
                </span>
                <span className="text-sm font-semibold">{option.label}</span>
                {isActive && <Check size={15} className="ml-auto text-[color:var(--muted)]" />}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
