import { XIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '~/components/ui/button';

/**
 * Floats above the list with what can be done with the chosen rows. Buttons in it: `onInk`, the one
 * that is the main action `brand`.
 */
export function SelectionBar({
  text,
  clearLabel,
  onClear,
  children,
  ...props
}: {
  text: ReactNode;
  clearLabel: string;
  onClear: () => void;
} & ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="selection-bar"
      className="sticky bottom-3 z-10 mx-auto mt-10 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl bg-ink p-2 pl-4 text-ink-foreground shadow-xl max-sm:w-full max-sm:pl-2 dark:border"
    >
      <div className="text-sm max-sm:flex-1 max-sm:pl-2 sm:mr-2">{text}</div>
      <div className="flex flex-wrap gap-2 max-sm:order-last max-sm:w-full max-sm:*:grow">
        {children}
      </div>
      <Button variant="onInk" size="icon" aria-label={clearLabel} onClick={onClear}>
        <XIcon aria-hidden />
      </Button>
    </div>
  );
}
