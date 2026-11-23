import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Shown instead of an empty list. */
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      {Icon && <Icon aria-hidden className="size-10 text-muted-foreground" />}
      <p className="text-lg font-semibold">{title}</p>
      {text && <p className="max-w-prose text-muted-foreground">{text}</p>}
      {action}
    </div>
  );
}
