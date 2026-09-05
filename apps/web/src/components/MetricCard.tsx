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
          : 'border-[var(--border-subtle)] bg-white',
      ].join(' ')}
    >
      <p className="text-xs font-semibold text-[var(--text-tertiary)]">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <strong className="text-2xl font-black tracking-tight">{value}</strong>
        <span className="text-[11px] text-[var(--text-tertiary)]">{detail}</span>
      </div>
    </article>
  )
}
