import type { ReactNode } from 'react';

/** Counts side by side in one frame. */
export function Stats({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none">
      {children}
    </dl>
  );
}

export function StatTile({
  label,
  value,
  detail,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] content-start items-baseline gap-x-2.5 bg-card px-4 py-3">
      <dd className="figure text-2xl leading-none">{value}</dd>
      <dt className="order-last min-w-0 text-sm text-muted-foreground sm:order-none">{label}</dt>
      {detail && <dd className="col-span-2 mt-1 text-sm text-muted-foreground">{detail}</dd>}
    </div>
  );
}
