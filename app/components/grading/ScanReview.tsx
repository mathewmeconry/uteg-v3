import { CheckIcon, XIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fullName } from '~/components/judging/types';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useCompetition } from '~/hooks/useCompetition';
import {
  evaluateFields,
  formatEntered,
  isSameGrade,
  toFields,
  type GradeFields,
} from '~/lib/domain/gradeInput';
import { sendGradeRequest } from '~/lib/gradeRequests';
import { SURE } from '~/lib/scan/confidence';
import type { ScanResult } from '~/lib/scan/scanPhoto.client';
import { cn } from '~/lib/utils';
import { GradeInputs } from './GradeInputs';

type Scanned = Extract<ScanResult, { kind: 'done' }>;
type Status = 'open' | 'saving' | 'saved' | 'discarded';
type RowState = { fields: GradeFields; status: Status; error: string | null };

/**
 * The grades read from one page next to the handwriting, to correct and accept right away. What is
 * not accepted here stays a scanned grade on the grading page.
 */
export function ScanReview({ result: { sheet, readings, images, scanned } }: { result: Scanned }) {
  const { t } = useTranslation(['judging', 'common']);
  const { competition } = useCompetition();
  const urls = useMemo(() => images.map((image) => image && URL.createObjectURL(image)), [images]);
  useEffect(() => () => urls.forEach((url) => url && URL.revokeObjectURL(url)), [urls]);

  const [rows, setRows] = useState<RowState[]>(() =>
    sheet.rows.map(({ inputRule, grade }, index) => {
      const reading = readings[index];
      const read = reading && { value: reading.value ?? 0, attempts: reading.attempts ?? [] };
      // Read like it is saved already: nothing to accept.
      const isSaved = read !== null && isSameGrade(read, grade);
      return {
        fields: toFields(read, inputRule),
        status: isSaved ? 'saved' : 'open',
        error: null,
      };
    }),
  );
  const isBusy = rows.some(({ status }) => status === 'saving');

  function update(index: number, patch: Partial<RowState>) {
    setRows((current) => current.with(index, { ...current[index], ...patch }));
  }

  /** Saves every open row with a grade, like typed on the grading page. */
  async function acceptAll() {
    for (const [index, row] of sheet.rows.entries()) {
      const { fields, status } = rows[index];
      const { grade } = evaluateFields(fields, row.inputRule);
      if (status !== 'open' || row.withdrawn || !grade) continue;
      update(index, { status: 'saving', error: null });
      const reply = await sendGradeRequest(`/api/competitions/${competition.id}/grades`, {
        intent: 'save',
        entryId: row.entryId,
        apparatus: sheet.apparatus,
        grade,
        version: row.grade?.version ?? null,
      });
      update(
        index,
        reply.ok
          ? { status: 'saved' }
          : {
              status: 'open',
              error:
                reply.code === 'OFFLINE' || reply.code === 'GONE'
                  ? t('scan.offline')
                  : t(`common:domainErrors.${reply.code}`),
            },
      );
    }
  }

  async function discard(index: number) {
    const id = scanned.find(({ row }) => row === index)?.id;
    update(index, { status: 'discarded', error: null });
    if (!id) return;
    const body = new URLSearchParams({ intent: 'discard', id });
    await fetch(`/api/competitions/${competition.id}/scans`, { method: 'POST', body }).catch(() =>
      update(index, { status: 'open', error: t('scan.offline') }),
    );
  }

  const open = rows.filter(
    ({ fields, status }, index) =>
      status === 'open' && evaluateFields(fields, sheet.rows[index].inputRule).grade !== null,
  ).length;

  return (
    <>
      <ol className="my-3 divide-y">
        {sheet.rows.map((row, index) => {
          const { fields, status, error } = rows[index];
          const name = fullName(row);
          const reading = readings[index];
          const isUnsure = status === 'open' && reading !== null && reading.confidence < SURE;
          return (
            <li
              key={row.entryId}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2',
                isUnsure && 'bg-warning/15',
              )}
            >
              <span className={cn('min-w-0 flex-1 basis-32', row.withdrawn && 'line-through')}>
                <span className="block font-medium">{name}</span>
                {row.grade && status === 'open' && (
                  <span className="block text-xs text-muted-foreground">
                    {t('grading.scannedSaved', { grade: formatEntered(row.grade.value) })}
                  </span>
                )}
              </span>
              {urls[index] && (
                <img
                  src={urls[index]}
                  alt={t('grading.scannedImage', { name })}
                  className="h-10 max-w-full rounded-sm bg-white"
                />
              )}
              {row.withdrawn ? (
                <Badge variant="outline">{t('withdrawn')}</Badge>
              ) : status === 'saved' ? (
                <Badge variant="outline">
                  <CheckIcon aria-hidden />
                  {t('scan.saved')}
                </Badge>
              ) : status === 'discarded' ? (
                <Badge variant="outline">{t('scan.discarded')}</Badge>
              ) : (
                <div className="flex items-center gap-1">
                  {isUnsure && (
                    <Badge variant="outline" className="border-warning">
                      {t('grading.scannedUnsure')}
                    </Badge>
                  )}
                  <GradeInputs
                    fields={fields}
                    evaluated={evaluateFields(fields, row.inputRule)}
                    rule={row.inputRule}
                    name={name}
                    compact
                    disabled={status === 'saving'}
                    onChange={(changed) => update(index, { fields: changed, error: null })}
                    onSubmit={() => {}}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={status === 'saving'}
                    aria-label={t('grading.discardScanFor', { name })}
                    onClick={() => void discard(index)}
                  >
                    <XIcon aria-hidden />
                  </Button>
                </div>
              )}
              {error && <p className="w-full text-sm text-destructive">{error}</p>}
            </li>
          );
        })}
      </ol>
      {open > 0 && (
        <Button disabled={isBusy} onClick={() => void acceptAll()}>
          <CheckIcon aria-hidden />
          {t('scan.acceptAll', { count: open })}
        </Button>
      )}
    </>
  );
}
