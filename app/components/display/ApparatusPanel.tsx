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
      className="@container-size flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card"
    >
      <h2
        className="shrink-0 truncate bg-sidebar leading-[1.4] px-[2cqw] font-bold text-sidebar-foreground"
        style={{ fontSize: size(10, 4) }}
      >
        {name}
      </h2>
      <div className="flex min-h-0 flex-1 flex-col justify-evenly px-[2cqw]">
        {current ? (
          <div className="flex min-w-0 items-center justify-between gap-[2cqw]">
            <div className="min-w-0 flex-1">
              <p
                className="line-clamp-2 pl-[0.05em] leading-[1.13] font-black wrap-anywhere"
                style={{ fontSize: size(26, 6.5) }}
              >
                {current.firstname} {current.lastname}
              </p>
              <p
                className="truncate leading-[1.25] text-muted-foreground"
                style={{ fontSize: size(9, 3.5) }}
              >
                {current.clubName}
              </p>
            </div>
            <p
              className="shrink-0 leading-none font-black tabular-nums"
              style={{ fontSize: size(50, 14) }}
            >
              {current.grade && formatGrade(current.grade.value, current.precision)}
            </p>
          </div>
        ) : (
          <p
            className="text-center font-bold text-muted-foreground"
            style={{ fontSize: size(20, 7) }}
          >
            {t('pause')}
          </p>
        )}
        {next && (
          <p className="truncate leading-[1.2]" style={{ fontSize: size(10, 3.8) }}>
            <span className="text-muted-foreground">{t('next')}: </span>
            <span className="font-bold">
              {next.firstname} {next.lastname}
            </span>
            <span className="text-muted-foreground"> · {next.clubName}</span>
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
