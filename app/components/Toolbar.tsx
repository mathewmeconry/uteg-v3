import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

/** Filters and settings of the list below it. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center gap-x-6 gap-y-3', className)}>
      {children}
    </div>
  );
}
