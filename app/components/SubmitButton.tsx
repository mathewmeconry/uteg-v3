import { LoaderCircleIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useNavigation } from 'react-router';
import { Button } from '~/components/ui/button';

/**
 * Disabled with a spinner while its form is submitted. With several forms on a page give each
 * button a `name` and `value`. Fetcher forms pass `pending={fetcher.state !== 'idle'}`.
 */
export function SubmitButton({
  pending,
  children,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { pending?: boolean }) {
  const { formData } = useNavigation();
  const ownSubmit =
    formData !== undefined && (!props.name || formData.get(props.name) === props.value);
  const isPending = pending ?? ownSubmit;

  return (
    <Button type="submit" disabled={disabled || isPending} aria-busy={isPending} {...props}>
      {isPending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
      {children}
    </Button>
  );
}
