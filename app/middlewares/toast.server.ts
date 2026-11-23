import type { MiddlewareFunction } from 'react-router';
import { toastContext, type Context, type ToastMessage } from '~/context';
import { TOAST_COOKIE } from '~/lib/toast';

/** Shows a toast once the response reached the browser, also after a redirect. */
export function enqueueToast(context: Context, toast: ToastMessage) {
  context.set(toastContext, [...context.get(toastContext), toast]);
}

/** Sends queued toasts as a cookie the browser reads and clears, see hooks/useToasts. */
export const toastMiddleware: MiddlewareFunction<Response> = async ({ context }, next) => {
  const response = await next();
  const toasts = context.get(toastContext);
  if (toasts.length > 0) {
    const value = encodeURIComponent(JSON.stringify(toasts));
    response.headers.append('Set-Cookie', `${TOAST_COOKIE}=${value}; Path=/; SameSite=Lax`);
  }
  return response;
};
