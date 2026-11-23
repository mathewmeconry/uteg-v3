import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Shown instead of an empty list. Says what is missing and offers the next step. */
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
    <div className="flex flex-col items-center gap-2 rounded-xl bg-muted px-6 py-12 text-center">
      {Icon && (
        <span className="mb-2 grid size-12 place-items-center rounded-full bg-card">
          <Icon aria-hidden className="size-6 text-primary" />
        </span>
      )}
      <p className="font-display text-xl leading-tight">{title}</p>
      {text && <p className="max-w-[52ch] text-balance text-muted-foreground">{text}</p>}
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
