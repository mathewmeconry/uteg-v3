import { useTranslation } from 'react-i18next';
import { useApparatusName } from '~/hooks/useApparatusName';
import { formatGrade } from '~/lib/domain/grade';
import { selectStarters } from './displayState';

type Slot = {
  entryId: string;
  firstname: string;
  lastname: string;
  clubName: string;
  withdrawn: boolean;
  precision: 2 | 3;
  grade: { value: number } | null;
};

/**
 * One apparatus. Sizes follow the panel (`cqh`, `cqw`), so any number of them fills the screen, and
 * the font size of the device (`--scale`).
 */
export function ApparatusPanel({
  apparatus,
  slots,
}: {
  apparatus: string;
  slots: readonly Slot[];
}) {
  const { t } = useTranslation('display');
  const name = useApparatusName()(apparatus);
  const { current, next } = selectStarters(slots);

  return (
    <section
      aria-label={name}
      className="@container-size flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-[color-mix(in_oklab,black_32%,var(--ink))]"
    >
      <h2
        className="shrink-0 truncate bg-ink-accent px-[2cqw] font-display leading-[1.4]"
        style={{ fontSize: size(10, 4.5) }}
      >
        {name}
      </h2>
      <div className="flex min-h-0 flex-1 flex-col justify-evenly px-[2cqw]">
        {current ? (
          <div className="flex min-w-0 items-center justify-between gap-[2cqw]">
            <div className="min-w-0 flex-1">
              <p
                className="line-clamp-2 pl-[0.05em] font-display leading-[1.13] wrap-anywhere"
                style={{ fontSize: size(26, 8) }}
              >
                {current.firstname} {current.lastname}
              </p>
              <p
                className="truncate leading-[1.25] text-ink-muted"
                style={{ fontSize: size(9, 4) }}
              >
                {current.clubName}
              </p>
            </div>
            <p
              // A new element for every grade, so that it lights up.
              key={`${current.entryId} ${current.grade?.value}`}
              className="new-grade shrink-0 figure leading-none text-brand"
              style={{ fontSize: size(50, 16) }}
            >
              {current.grade && formatGrade(current.grade.value, current.precision)}
            </p>
          </div>
        ) : (
          <p className="text-center font-display text-ink-muted" style={{ fontSize: size(20, 7) }}>
            {t('pause')}
          </p>
        )}
        {next && (
          <p className="truncate leading-[1.2]" style={{ fontSize: size(10, 3.8) }}>
            <span className="text-ink-muted">{t('next')}: </span>
            <span className="font-semibold">
              {next.firstname} {next.lastname}
            </span>
            <span className="text-ink-muted"> · {next.clubName}</span>
          </p>
        )}
      </div>
    </section>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A share of the panel's width, times the font size. The shares of the height add up to the whole
 * panel, so nothing is cut off however large the font is.
 */
function size(height: number, width: number) {
  return `min(${height}cqh, calc(min(${height}cqh, ${width}cqw) * var(--scale)))`;
}
