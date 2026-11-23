import { cn } from '~/lib/utils';

/** The mark: two swinging rings. Same drawing as public/favicon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={cn('size-8 shrink-0', className)}>
      <rect width="32" height="32" rx="7" className="fill-sidebar" />
      <g fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-brand">
        <path d="M11 5v9M21 5v9" />
        <circle cx="11" cy="20" r="5" />
        <circle cx="21" cy="20" r="5" />
      </g>
    </svg>
  );
}
