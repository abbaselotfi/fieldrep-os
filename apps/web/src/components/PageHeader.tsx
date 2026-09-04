import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-extrabold tracking-[0.14em] text-[var(--accent-strong)]">{eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">{description}</p>
      </div>
      {actions === undefined ? null : <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
