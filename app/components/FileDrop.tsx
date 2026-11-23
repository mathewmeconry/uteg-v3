import { ImageUpIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

/**
 * A file input as a box that can be clicked and that files can be dropped on. Use it in a FormField,
 * the props are those of the input.
 */
export function FileDrop({
  text,
  preview,
  ...inputProps
}: {
  text: ReactNode;
  /** Instead of the icon. */
  preview?: ReactNode;
} & Omit<ComponentProps<'input'>, 'type' | 'className'>) {
  return (
    <div className="relative flex min-h-20 min-w-0 items-center gap-4 rounded-lg border border-dashed border-input bg-card px-4 py-3 has-disabled:opacity-50 has-aria-disabled:opacity-50 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring has-[:hover]:bg-accent">
      {preview ?? <ImageUpIcon aria-hidden className="size-6 shrink-0 text-primary" />}
      <span className="min-w-0 text-sm font-semibold wrap-anywhere text-foreground">{text}</span>
      <input
        {...inputProps}
        type="file"
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed aria-disabled:cursor-not-allowed"
      />
    </div>
  );
}
