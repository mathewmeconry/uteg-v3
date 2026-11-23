import { useId, type ComponentProps, type ReactNode } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';

export type FieldControlProps = {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
};

/**
 * Label, control, hint and error. Renders an Input from the remaining props, or any control:
 * `<FormField label="…" error={errors?.ground}>{(props) => <Textarea {...props} name="…" />}</FormField>`
 */
export function FormField({
  label,
  error,
  hint,
  children,
  ...inputProps
}: {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  children?: (props: FieldControlProps) => ReactNode;
} & Omit<ComponentProps<typeof Input>, 'children' | 'id'>) {
  const id = useId();
  const controlProps: FieldControlProps = {
    id,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  };

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children ? children(controlProps) : <Input {...inputProps} {...controlProps} />}
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : (
        hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
      )}
    </Field>
  );
}
