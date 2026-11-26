import { CameraIcon, CircleAlertIcon, LoaderCircleIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Route } from './+types/scan';
import { PageHeader } from '~/components/PageHeader';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useApparatusName } from '~/hooks/useApparatusName';
import { useCompetition } from '~/hooks/useCompetition';
import { categoryName } from '~/lib/categoryName';
import { formatEntered } from '~/lib/domain/gradeInput';
import { SURE } from '~/lib/scan/rows';
import { scanPhoto, type ScanResult } from '~/lib/scan/scanPhoto.client';
import { cn } from '~/lib/utils';
import { requireRole } from '~/middlewares/competition.server';

export function loader({ context }: Route.LoaderArgs) {
  requireRole(context, 'EDITOR');
  return null;
}

type Photo = { key: number; name: string; result: ScanResult | null };

let nextKey = 0;

export default function Scan({ params: { contestId } }: Route.ComponentProps) {
  const { t } = useTranslation(['judging', 'common']);
  const { competition } = useCompetition();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const gradingUrl = `/competitions/${competition.id}/contests/${contestId}/grading`;

  async function read(files: File[]) {
    // One after the other, as each takes the processor for a moment.
    for (const file of files) {
      const key = nextKey++;
      setPhotos((current) => [{ key, name: file.name, result: null }, ...current]);
      const result = await scanPhoto(competition.id, file).catch((): ScanResult => ({
        kind: 'error',
        message: t('scan.failed'),
      }));
      setPhotos((current) =>
        current.map((photo) => (photo.key === key ? { ...photo, result } : photo)),
      );
    }
  }

  return (
    <>
      <title>{`${t('scan.title')} · UTEG`}</title>
      <PageHeader
        breadcrumbs={[{ to: gradingUrl, label: t('gradingTitle') }]}
        title={t('scan.title')}
      />
      <p className="mb-4 max-w-prose text-muted-foreground">{t('scan.intro')}</p>
      <Button asChild>
        <label>
          <CameraIcon aria-hidden />
          {t('scan.choose')}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              // The same photos may be chosen again.
              event.target.value = '';
              void read(files);
            }}
          />
        </label>
      </Button>
      <ul className="mt-6 grid gap-4">
        {photos.map((photo) => (
          <li key={photo.key} className="flex items-start gap-2 rounded-xl border bg-card p-4">
            <div className="min-w-0 flex-1">
              <PhotoResult photo={photo} />
            </div>
            {photo.result && (
              <Button
                size="icon"
                variant="ghost"
                className="-my-2 -mr-2 shrink-0"
                aria-label={t('scan.dismiss', { name: photo.name })}
                onClick={() =>
                  setPhotos((current) => current.filter(({ key }) => key !== photo.key))
                }
              >
                <XIcon aria-hidden />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function PhotoResult({ photo: { name, result } }: { photo: Photo }) {
  const { t } = useTranslation(['judging', 'common']);
  const { competition } = useCompetition();
  const apparatusName = useApparatusName();

  if (!result) {
    return (
      <p className="flex items-center gap-2">
        <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
        {name} · {t('scan.reading')}
      </p>
    );
  }
  if (result.kind !== 'done') {
    return (
      <p className="flex items-center gap-2 text-destructive">
        <CircleAlertIcon aria-hidden className="size-4 shrink-0" />
        {name} · {result.kind === 'error' ? result.message : t(`scan.${result.kind}`)}
      </p>
    );
  }

  const { sheet, readings, count } = result;
  const [first] = sheet.divisions;
  return (
    <>
      <h2 className="font-bold">
        {apparatusName(sheet.apparatus)} · {t('common:round', { number: sheet.round + 1 })}
      </h2>
      <p className="text-sm text-muted-foreground">
        {sheet.divisions
          .map(
            ({ category, sex, number }) =>
              `${categoryName(category, t)} ${t(`sexShort.${sex}`)} ${number}`,
          )
          .join(', ')}
      </p>
      <ol className="my-3 divide-y">
        {sheet.rows.map((row, index) => {
          const reading = readings[index];
          return (
            <li
              key={index}
              className={cn('flex items-center gap-2 py-1.5', row.withdrawn && 'line-through')}
            >
              <span className="min-w-0 flex-1 truncate">
                {row.firstname} {row.lastname}
              </span>
              {reading && reading.confidence < SURE && (
                <Badge variant="outline">{t('grading.scannedUnsure')}</Badge>
              )}
              <span className="tabular-nums">
                {reading
                  ? (reading.attempts ?? [reading.value!]).map(formatEntered).join(' / ')
                  : !row.withdrawn && t('scan.unread')}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="flex flex-wrap items-center justify-between gap-2">
        {t('scan.sent', { count })}
        <Button asChild variant="outline">
          <Link
            to={`/competitions/${competition.id}/contests/${first.contestId}/grading?ground=${first.ground}`}
          >
            {t('scan.toGrading')}
          </Link>
        </Button>
      </p>
    </>
  );
}
