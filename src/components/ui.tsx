import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import type { Confidence } from '@/lib/types'

export function Card({
  className,
  children,
  id,
}: {
  className?: string
  children: ReactNode
  id?: string
}) {
  return (
    <div id={id} className={clsx('card', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx('section-title', className)}>{children}</p>
}

type Tone = 'neutral' | 'brand' | 'green' | 'amber' | 'red' | 'violet'

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  brand: 'bg-brand-100 text-brand-700',
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-rose-100 text-rose-700',
  violet: 'bg-violet-100 text-violet-700',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return <span className={clsx('chip', toneClasses[tone], className)}>{children}</span>
}

export function ConfidenceBadge({ value }: { value: Confidence }) {
  const tone: Tone = value === 'high' ? 'green' : value === 'medium' ? 'amber' : 'red'
  return (
    <Badge tone={tone} className="capitalize">
      {value} confidence
    </Badge>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-16 text-center">
      {icon && <div className="mb-4 text-ink-300">{icon}</div>}
      <h3 className="text-lg font-semibold text-ink-800">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-ink-200/70 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink-900">{value}</p>
      {sub && <p className="text-xs text-ink-400">{sub}</p>}
    </div>
  )
}

export function KeyValueList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-ink-400">—</p>
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-sm text-ink-700">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}
