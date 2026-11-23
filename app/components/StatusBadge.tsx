import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';

export type StatusTone = 'neutral' | 'live' | 'done' | 'warning' | 'danger';

const STYLES: Record<StatusTone, string> = {
  neutral: 'border-border bg-card text-muted-foreground',
  // Brand yellow-green is only for what is happening right now.
  live: 'bg-brand text-brand-foreground',
  done: 'bg-[color-mix(in_oklch,var(--success)_13%,var(--card))] text-success',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-[color-mix(in_oklch,var(--destructive)_12%,var(--card))] text-destructive',
};

/** A state in a word, with an icon so that it is not only a colour. */
export function StatusBadge({
  tone = 'neutral',
  icon: Icon,
  children,
  className,
}: {
  tone?: StatusTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge className={cn('h-6 px-2', STYLES[tone], className)}>
      {Icon && <Icon aria-hidden />}
      {tone === 'live' && !Icon && (
        <span aria-hidden className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
      )}
      {children}
    </Badge>
  );
}
