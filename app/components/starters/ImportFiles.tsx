import {
  DownloadIcon,
  FileSpreadsheetIcon,
  LoaderCircleIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { useSexes } from '~/hooks/useSexes';
import type { ImportedStarter } from '~/lib/domain/starterImport';
import { cn } from '~/lib/utils';
import { MAX_FILE_MB, MAX_IMPORT_ROWS, readStarterFile, type FileError } from './importFile';

export type ImportFile = {
  id: string;
  name: string;
  starters: ImportedStarter[];
  /** The sheets without the columns of a starter list. */
  skippedSheets: string[];
  error?: FileError;
};

/** Reads the chosen files and lists them with what was found. */
export function ImportFiles({
  files,
  onAdd,
  onRemove,
}: {
  files: ImportFile[];
  onAdd: (files: ImportFile[]) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const sexes = useSexes();
  const [isReading, setIsReading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  async function read(list: FileList | null) {
    // The list empties when the input is reset.
    const chosen = [...(list ?? [])];
    if (chosen.length === 0) return;
    setIsReading(true);
    const added: ImportFile[] = [];
    for (const file of chosen) {
      const result = await readStarterFile(file, sexes.length === 1 ? sexes[0] : undefined);
      added.push({
        id: crypto.randomUUID(),
        name: file.name,
        starters: [],
        skippedSheets: [],
        ...result,
      });
    }
    setIsReading(false);
    onAdd(added);
  }

  function handleDrag(event: DragEvent, isOver: boolean) {
    event.preventDefault();
    setIsDragging(isOver);
  }

  return (
    <div className="grid gap-3">
      <label
        className={cn(
          'flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-card p-6 text-center focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent/50',
          isDragging && 'border-primary bg-accent',
        )}
        onDragOver={(event) => handleDrag(event, true)}
        onDragLeave={(event) => handleDrag(event, false)}
        onDrop={(event) => {
          handleDrag(event, false);
          void read(event.dataTransfer.files);
        }}
      >
        <UploadIcon aria-hidden className="size-7 text-primary" />
        <span className="font-semibold">{t('import.drop')}</span>
        <span className="text-sm text-muted-foreground">
          {t('import.limits', { size: MAX_FILE_MB, rows: MAX_IMPORT_ROWS })}
        </span>
        <input
          type="file"
          multiple
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label={t('import.files')}
          className="sr-only"
          onChange={(event) => {
            void read(event.target.files);
            // The same file can be chosen again after it was corrected.
            event.target.value = '';
          }}
        />
      </label>

      <div role="status" className="empty:hidden">
        {isReading && (
          <p className="flex items-center gap-2 text-sm">
            <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
            {t('import.reading')}
          </p>
        )}
      </div>
      {files.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card">
          {files.map(({ id, name, starters, skippedSheets, error }) => (
            <li key={id} className="flex items-center gap-3 py-2 pr-1 pl-4">
              <FileSpreadsheetIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">{name}</p>
                {error ? (
                  <p className="text-destructive">{t(`import.fileErrors.${error}`)}</p>
                ) : (
                  <p className="text-muted-foreground">
                    {t('common:starterCount', { count: starters.length })}
                  </p>
                )}
                {skippedSheets.length > 0 && (
                  <p>{t('import.skippedSheets', { names: skippedSheets.join(', ') })}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('import.removeFile', { name })}
                onClick={() => onRemove(id)}
              >
                <XIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl bg-muted p-4">
        <p className="min-w-0 flex-1 basis-72 text-sm text-muted-foreground">
          {t('import.columnsHint')}
        </p>
        <Button variant="outline" asChild>
          <a href="/templates/UTEG-Import-Vorlage.xlsx" download>
            <DownloadIcon aria-hidden />
            {t('import.template')}
          </a>
        </Button>
      </div>
    </div>
  );
}
