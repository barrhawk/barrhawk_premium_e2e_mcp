import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  max?: number
  className?: string
  indicatorClassName?: string
}

export function Progress({ value, max = 100, className, indicatorClassName }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={cn('h-1.5 w-full rounded-full bg-muted overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-300', indicatorClassName || 'bg-primary')}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

export function ResourceBar({
  label,
  value,
  color = 'bg-primary'
}: {
  label: string
  value: number
  color?: string
}) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <span className="text-[10px] text-muted-foreground w-8">{label}</span>
      <Progress value={value} className="flex-1 h-1" indicatorClassName={color} />
      <span className="text-[10px] text-muted-foreground w-8 text-right">{value}%</span>
    </div>
  )
}
