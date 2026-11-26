import { CircleAlertIcon, ImagesIcon, LoaderCircleIcon, ScanLineIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Route } from './+types/scan';
import { PageScanner, type ScannerNotice } from '~/components/grading/PageScanner';
import { ScanReview } from '~/components/grading/ScanReview';
import { PageHeader } from '~/components/PageHeader';
import { Button } from '~/components/ui/button';
import { useApparatusName } from '~/hooks/useApparatusName';
import { useCompetition } from '~/hooks/useCompetition';
import { categoryName } from '~/lib/categoryName';
import { scanPhoto, type ScanResult } from '~/lib/scan/scanPhoto.client';
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
  const apparatusName = useApparatusName();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  /** What came of the last photo, for the scanner. */
  const [notice, setNotice] = useState<ScannerNotice | null>(null);
  /** The QR codes of the sheets read on this page. */
  const read = useRef(new Set<string>());
  const gradingUrl = `/competitions/${competition.id}/contests/${contestId}/grading`;

  async function scan(files: File[]) {
    // One after the other, as each takes the processor for a moment.
    for (const file of files) {
      const key = nextKey++;
      setPhotos((current) => [{ key, name: file.name, result: null }, ...current]);
      const result = await scanPhoto(competition.id, file).catch((): ScanResult => ({
        kind: 'error',
        message: t('scan.failed'),
      }));
      // A sheet scanned again replaces its earlier card, e.g. with a sharper photo.
      const code = result.kind === 'done' ? result.code : null;
      const isAgain = code !== null && read.current.has(code);
      if (code) read.current.add(code);
      setPhotos((current) =>
        current
          .filter((photo) => photo.result?.kind !== 'done' || photo.result.code !== code)
          .map((photo) => (photo.key === key ? { ...photo, result } : photo)),
      );
      setNotice(describe(result, isAgain));
    }
  }

  function describe(result: ScanResult, isAgain: boolean): ScannerNotice {
    if (result.kind === 'error') return { text: result.message, tone: 'error' };
    if (result.kind !== 'done') return { text: t(`scan.${result.kind}`), tone: 'error' };
    const sheet = `${apparatusName(result.sheet.apparatus)} · ${t('common:round', { number: result.sheet.round + 1 })}`;
    return isAgain
      ? { text: t('scanner.again', { sheet }), tone: 'warning' }
      : { text: t('scanner.read', { sheet }), tone: 'success' };
  }

  return (
    <>
      <title>{`${t('scan.title')} · UTEG`}</title>
      <PageHeader
        breadcrumbs={[{ to: gradingUrl, label: t('gradingTitle') }]}
        title={t('scan.title')}
      />
      <p className="mb-4 max-w-prose text-muted-foreground">{t('scan.intro')}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setIsScanning(true)}>
          <ScanLineIcon aria-hidden />
          {t('scanner.open')}
        </Button>
        <Button asChild variant="outline">
          <label>
            <ImagesIcon aria-hidden />
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
                void scan(files);
              }}
            />
          </label>
        </Button>
      </div>
      {isScanning && (
        <PageScanner
          notice={notice}
          onPhoto={(photo) => {
            const name = t('scanner.photo', { number: photos.length + 1 });
            void scan([new File([photo], `${name}.jpg`, { type: photo.type })]);
          }}
          onClose={() => {
            setIsScanning(false);
            setNotice(null);
          }}
        />
      )}
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

  const { sheet } = result;
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
      <ScanReview result={result} />
      <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        {t('scan.later')}
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
