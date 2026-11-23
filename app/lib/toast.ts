import { toast } from 'sonner';
import type { ToastMessage } from '~/context';

export const TOAST_COOKIE = 'toasts';

/** Shows the toasts the server queued in the cookie and clears it. */
export function showQueuedToasts() {
  const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${TOAST_COOKIE}=`));
  if (!entry) return;
  document.cookie = `${TOAST_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  const toasts = JSON.parse(
    decodeURIComponent(entry.slice(TOAST_COOKIE.length + 1)),
  ) as ToastMessage[];
  for (const { type, message } of toasts) toast[type](message);
}
