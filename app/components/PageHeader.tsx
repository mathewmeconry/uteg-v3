import { ArrowLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/** Title of a page with its main actions on the right. Sub pages have the way back above it. */
export function PageHeader({
  title,
  description,
  actions,
  status,
  breadcrumbs,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Badges next to the title. */
  status?: ReactNode;
  /** The pages above this one. */
  breadcrumbs?: { to: string; label: string }[];
}) {
  const { t } = useTranslation();
  return (
    <header className="mb-6 grid gap-2">
      {breadcrumbs && (
        <nav aria-label={t('nav.breadcrumbs')}>
          <ol className="-my-1 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {breadcrumbs.map(({ to, label }, index) => (
              <Fragment key={to}>
                {index > 0 ? (
                  <ChevronRightIcon aria-hidden className="size-4" />
                ) : (
                  <ArrowLeftIcon aria-hidden className="size-4" />
                )}
                <li>
                  <Link
                    to={to}
                    className="inline-flex items-center py-1 underline-offset-4 hover:text-foreground hover:underline pointer-coarse:min-h-11"
                  >
                    {label}
                  </Link>
                </li>
              </Fragment>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1
              // Gets the focus when what had it was deleted, see ConfirmDialog.
              tabIndex={-1}
              className="min-w-0 font-display text-[1.75rem] leading-tight wrap-anywhere outline-none md:text-[2rem]"
            >
              {title}
            </h1>
            {status}
          </div>
          {description && <p className="mt-0.5 text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
