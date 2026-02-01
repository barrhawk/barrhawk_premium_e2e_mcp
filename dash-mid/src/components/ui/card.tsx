import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  glow?: 'bridge' | 'doctor' | 'igor' | 'stream'
}

const glowClasses = {
  bridge: 'glow-bridge border-bridge/30',
  doctor: 'glow-doctor border-doctor/30',
  igor: 'glow-igor border-igor/30',
  stream: 'glow-stream border-stream/30',
}

export function Card({ children, className, glow }: CardProps) {
  return (
    <div
      className={cn(
        'glass rounded-xl overflow-hidden',
        glow && glowClasses[glow],
        className
      )}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  icon?: React.ReactNode
  iconBg?: string
  trailing?: React.ReactNode
}

export function CardHeader({ title, icon, iconBg = 'bg-primary', trailing }: CardHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
      {icon && (
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center text-white', iconBg)}>
          {icon}
        </div>
      )}
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  )
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-4', className)}>{children}</div>
}
