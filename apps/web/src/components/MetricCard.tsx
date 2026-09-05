interface MetricCardProps {
  label: string
  value: string
  detail: string
  emphasis?: boolean
}

export function MetricCard({ label, value, detail, emphasis = false }: MetricCardProps) {
  return (
    <article
      className={[
        'rounded-[22px] border p-4 sm:p-5',
        emphasis
          ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
          : 'border-[var(--border-subtle)] bg-[var(--surface-raised)]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold text-[var(--text-tertiary)]">{label}</p>
        <span className={['h-2 w-2 rounded-full', emphasis ? 'bg-[var(--accent-strong)]' : 'bg-[var(--border-strong)]'].join(' ')} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <strong className="text-2xl font-black tracking-tight sm:text-[28px]">{value}</strong>
        <span className="text-[11px] font-semibold text-[var(--text-tertiary)]">{detail}</span>
      </div>
    </article>
  )
}
