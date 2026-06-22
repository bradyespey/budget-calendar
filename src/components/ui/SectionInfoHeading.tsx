import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

interface SectionInfoHeadingProps {
  title: string
  items: string[]
  as?: 'h2' | 'h3'
  className?: string
  headingClassName?: string
}

export function SectionInfoHeading({
  title,
  items,
  as = 'h3',
  className = '',
  headingClassName = 'text-[1.45rem]',
}: SectionInfoHeadingProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ left: 16, top: 16 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const HeadingTag = as

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return

    const buttonRect = buttonRef.current.getBoundingClientRect()
    const tooltipWidth = Math.min(384, window.innerWidth - 32)
    const left = Math.min(Math.max(16, buttonRect.left), window.innerWidth - tooltipWidth - 16)
    const top = Math.min(buttonRect.bottom + 10, window.innerHeight - 160)

    setPosition({ left, top })
  }, [isOpen])

  return (
    <div className={`relative flex min-w-0 items-center gap-2 ${className}`}>
      <HeadingTag className={`section-display text-[color:var(--text)] ${headingClassName}`}>
        {title}
      </HeadingTag>
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--surface-muted)] text-[color:var(--muted)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
        aria-label={`${title} help`}
        title={`${title} help`}
        onClick={() => setIsOpen(!isOpen)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {isOpen && createPortal(
        <div
          className="fixed z-[130] max-h-[min(22rem,calc(100vh-2rem))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-[14px] border border-[color:var(--line-strong)] bg-[#fffdfa] p-3 text-xs leading-5 text-[color:var(--muted)] shadow-xl dark:bg-[#1d2228]"
          style={{ left: position.left, top: position.top }}
        >
          <ul className="list-disc space-y-1 pl-4">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>,
        document.body
      )}
    </div>
  )
}
