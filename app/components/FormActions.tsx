import type { ReactNode } from 'react';

/** Buttons of a form that is longer than the screen. Stays at the bottom edge. */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="form-actions"
      className="sticky bottom-(--bottom-nav) z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background px-4 py-3 md:mx-0 md:px-0"
    >
      {children}
    </div>
  );
}
