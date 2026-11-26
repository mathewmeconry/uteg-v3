import { CheckIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fullName, type TabletSlot } from '~/components/judging/types';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useActionFetcher } from '~/hooks/useActionFetcher';
import { useCompetition } from '~/hooks/useCompetition';
import { formatEntered, isSameGrade, type StoredGrade } from '~/lib/domain/gradeInput';
import { SURE } from '~/lib/scan/rows';

/**
 * A grade read from a photo of a judging sheet, next to the handwriting it was read from. Accepting
 * saves it like typed, discarding leaves the row as it is.
 */
export function ScannedGrade({
  slot,
  scanned,
  saved,
  onAccept,
}: {
  slot: TabletSlot;
  scanned: NonNullable<TabletSlot['scanned']>;
  saved: StoredGrade | null;
  onAccept: () => void;
}) {
  const { t } = useTranslation('judging');
  const { competition } = useCompetition();
  const { Form } = useActionFetcher();
  const name = fullName(slot);
  const grade = [...scanned.attempts, scanned.value].map(formatEntered).join(' / ');

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-dashed p-2">
      <img
        src={`/api/competitions/${competition.id}/scans/${scanned.id}`}
        alt={t('grading.scannedImage', { name })}
        className="h-10 max-w-full rounded-sm bg-white"
      />
      <span className="text-sm">
        <span className="font-semibold tabular-nums">{t('grading.scanned', { grade })}</span>
        {scanned.confidence < SURE && (
          <Badge variant="outline" className="ml-2 border-warning bg-warning/15">
            {t('grading.scannedUnsure')}
          </Badge>
        )}
        {saved && !isSameGrade(saved, scanned) && (
          <span className="ml-2 text-muted-foreground">
            {t('grading.scannedSaved', { grade: formatEntered(saved.value) })}
          </span>
        )}
      </span>
      <div className="ml-auto flex gap-1">
        <Button size="sm" aria-label={t('grading.acceptScanFor', { name })} onClick={onAccept}>
          <CheckIcon aria-hidden />
          {t('grading.acceptScan')}
        </Button>
        <Form method="post">
          <input type="hidden" name="intent" value="discardScan" />
          <input type="hidden" name="id" value={scanned.id} />
          <Button
            type="submit"
            size="icon"
            variant="outline"
            aria-label={t('grading.discardScanFor', { name })}
          >
            <XIcon aria-hidden />
          </Button>
        </Form>
      </div>
    </div>
  );
}
