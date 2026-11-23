import type { ComponentProps } from 'react';
import { cn } from '~/lib/utils';

/** The browser's select: light enough for long tables and easy to use on phones. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      // Gets the touch size of the other selects.
      data-slot="select-trigger"
      className={cn(
        'h-10 w-full min-w-0 rounded-md border border-input bg-card px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
