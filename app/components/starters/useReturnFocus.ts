import { useState } from 'react';

/**
 * The onCloseAutoFocus of a dialog that has no trigger, which Radix would leave without focus.
 * Focuses what had the focus when the dialog opened, if it still exists.
 */
export function useReturnFocus() {
  const [opener] = useState(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );
  return (event: Event) => {
    event.preventDefault();
    opener?.focus();
  };
}
