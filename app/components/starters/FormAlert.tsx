import { TriangleAlertIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Alert, AlertDescription } from '~/components/ui/alert';

/** The error of a form. Takes the focus, because the button that was pressed lost it. */
export function FormAlert({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);

  return (
    <Alert ref={ref} variant="destructive" tabIndex={-1}>
      <TriangleAlertIcon aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
