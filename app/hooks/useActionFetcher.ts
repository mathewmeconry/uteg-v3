import { useEffect, useEffectEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher, useRevalidator } from 'react-router';
import { toast } from 'sonner';
import { isServerReachable } from '~/lib/reachable';

/** What actions return when something went wrong: `failed` is set by safeClientAction. */
type ActionFailure = { error?: string; errors?: Record<string, string>; failed?: number };

/**
 * A fetcher that calls `onSuccess` after the action worked and the page has the new data, e.g. to
 * close a dialog. Failures `{ error }` are shown as a toast and the page is loaded again, since what
 * it shows may be outdated. Field errors `{ errors }` are left to the form, see `errors`.
 */
export function useActionFetcher(onSuccess?: () => void) {
  const { t } = useTranslation();
  const fetcher = useFetcher<ActionFailure | null>();
  const { revalidate } = useRevalidator();
  const wasBusy = useRef(false);

  const onDone = useEffectEvent(async () => {
    const { error, errors, failed } = fetcher.data ?? {};
    if (!error && !errors && !failed) return onSuccess?.();
    if (errors) return;
    if (failed === 403) toast.error(t('domainErrors.FORBIDDEN'));
    else if (failed === 404) toast.error(t('domainErrors.NOT_FOUND'));
    else toast.error(error ?? t('errors.connection'));
    if (await isServerReachable()) await revalidate();
  });

  useEffect(() => {
    if (fetcher.state !== 'idle') {
      wasBusy.current = true;
    } else if (wasBusy.current) {
      wasBusy.current = false;
      void onDone();
    }
  }, [fetcher.state]);

  return {
    Form: fetcher.Form,
    submit: fetcher.submit,
    pending: fetcher.state !== 'idle',
    errors: fetcher.data?.errors,
  };
}
