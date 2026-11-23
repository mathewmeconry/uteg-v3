import {
  createElement,
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher, useRevalidator } from 'react-router';
import { toast } from 'sonner';
import { isServerReachable } from '~/lib/reachable';

/** What actions return when something went wrong: `failed` is set by safeClientAction. */
type ActionFailure = {
  error?: string;
  errors?: Record<string, string | undefined>;
  failed?: number;
};

type Fetcher = ReturnType<typeof useFetcher<ActionFailure | null>>;

/**
 * A fetcher that calls `onSuccess` after the action worked and the page has the new data, e.g. to
 * close a dialog. Failures `{ error }` are shown as a toast and the page is loaded again, since what
 * it shows may be outdated. Field errors `{ errors }` are left to the form, see `errors`.
 */
export function useActionFetcher(onSuccess?: () => void) {
  const fetcher = useFetcher<ActionFailure | null>();
  const showFailure = useShowFailure();
  const { Form: FetcherForm, submit: fetcherSubmit } = fetcher;
  const [answers, setAnswers] = useState(0);
  const handledAnswers = useRef(0);
  const lastData = useRef<unknown>(undefined);

  const onAnswer = useEffectEvent(() => {
    // A redirect has no data, the fetcher then still has the one from before.
    const data = fetcher.data === lastData.current ? null : fetcher.data;
    lastData.current = fetcher.data;

    const { error, errors, failed } = data ?? {};
    if (!error && !errors && !failed) return onSuccess?.();
    if (!errors) void showFailure({ error, failed });
  });

  useEffect(() => {
    // The answer comes before the page is loaded again.
    if (fetcher.state !== 'idle' || handledAnswers.current === answers) return;
    handledAnswers.current = answers;
    onAnswer();
  }, [answers, fetcher.state]);

  const { Form, submit } = useMemo(() => {
    // Counts answers instead of watching the state, which may be idle again before it is rendered.
    const submit: Fetcher['submit'] = async (...args) => {
      await fetcherSubmit(...args);
      // The router shows its data in a transition too, the answer must not be seen before.
      startTransition(() => setAnswers((count) => count + 1));
    };

    function Form({ onSubmit, ...props }: ComponentProps<Fetcher['Form']>) {
      return createElement(FetcherForm, {
        ...props,
        onSubmit(event) {
          onSubmit?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          const { submitter } = event.nativeEvent as SubmitEvent;
          void submit((submitter ?? event.currentTarget) as HTMLFormElement | HTMLButtonElement);
        },
      });
    }
    return { Form, submit };
  }, [FetcherForm, fetcherSubmit]);

  return {
    Form,
    submit,
    pending: fetcher.state !== 'idle',
    /** What is being sent. */
    formData: fetcher.formData,
    errors: fetcher.data?.errors,
  };
}

/**
 * The same for a `<Form>` of a route with safeClientAction: shows other failures and returns the
 * field errors.
 */
export function useActionErrors(actionData: unknown) {
  const { error, errors, failed } = (actionData as ActionFailure | null | undefined) ?? {};
  const showFailure = useEffectEvent(useShowFailure());
  useEffect(() => {
    if (error || failed) void showFailure({ error, failed });
    // Every answer is a new object, also when it fails the same way again.
  }, [actionData, error, failed]);
  return errors ?? {};
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function useShowFailure() {
  const { t } = useTranslation();
  const { revalidate } = useRevalidator();

  return async function showFailure({ error, failed }: ActionFailure) {
    if (failed === 403) toast.error(t('domainErrors.FORBIDDEN'));
    else if (failed === 404) toast.error(t('domainErrors.NOT_FOUND'));
    else toast.error(error ?? t('errors.connection'));
    if (await isServerReachable()) await revalidate();
  };
}
