import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error' | 'muted'
  className?: string
}

const variants = {
  default: 'bg-primary/15 text-primary border-primary/30',
  success: 'bg-ok/15 text-ok border-ok/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  error: 'bg-error/15 text-error border-error/30',
  muted: 'bg-muted text-muted-foreground border-border',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const variant = (() => {
    switch (status.toLowerCase()) {
      case 'running':
      case 'ready':
      case 'connected':
      case 'ok':
        return 'success'
      case 'busy':
      case 'warning':
      case 'queued':
        return 'warning'
      case 'error':
      case 'crashed':
      case 'disconnected':
        return 'error'
      default:
        return 'muted'
    }
  })()

  return <Badge variant={variant}>{status}</Badge>
}
