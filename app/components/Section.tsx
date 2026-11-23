import { useId, type ReactNode } from 'react';
import { cn } from '~/lib/utils';

/**
 * Part of a settings page or long form: what it is about on the left, the fields on the right.
 * Put several into <Sections>.
 */
export function Section({
  title,
  description,
  children,
  tone = 'default',
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'danger';
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="grid grid-cols-1 gap-x-10 gap-y-4 py-7 first:pt-0 lg:grid-cols-[14rem_minmax(0,1fr)]"
    >
      <div>
        <h2
          id={id}
          className={cn(
            'font-display text-lg leading-tight',
            tone === 'danger' && 'text-destructive',
          )}
        >
          {title}
        </h2>
        {description && (
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function Sections({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('max-w-5xl divide-y', className)}>{children}</div>;
}
