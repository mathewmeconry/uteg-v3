import { ImageUpIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '~/components/FormField';
import { Button } from '~/components/ui/button';

/**
 * Uploads the picture as it is shown, without metadata, which the server would leave out. What
 * cannot be drawn stays as it is, the server then says why it is no logo.
 */
async function replaceWithDrawing(input: HTMLInputElement, file: File) {
  try {
    const { drawLogo } = await import('~/lib/images.client');
    const drawing = await drawLogo(file);
    // Something else may have been chosen meanwhile.
    if (!drawing || input.files?.[0] !== file) return;
    const transfer = new DataTransfer();
    transfer.items.add(drawing);
    input.files = transfer.files;
  } catch {
    // Stays as it is.
  }
}

/** File input of the logo with a preview of the chosen file. */
export function LogoField({ error, required }: { error?: string; required?: boolean }) {
  const { t } = useTranslation('competition');
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>();
  // Null also when the file cannot be shown.
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="grid grid-cols-1 gap-3">
      <FormField label={t('fields.logo')} hint={t('fields.logoHint')} error={error}>
        {(props) => (
          // The input covers the box, so it can be clicked and files can be dropped on it.
          <div className="relative flex min-h-20 items-center gap-4 rounded-lg border border-dashed border-input bg-card px-4 py-3 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:hover]:bg-accent">
            {preview ? (
              <img
                src={preview}
                alt=""
                className="h-14 max-w-40 object-contain"
                onError={() => setPreview(null)}
              />
            ) : (
              <ImageUpIcon aria-hidden className="size-6 shrink-0 text-primary" />
            )}
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
              {fileName ?? t('fields.logoChoose')}
            </span>
            <input
              {...props}
              ref={input}
              name="logo"
              type="file"
              accept="image/png,image/jpeg"
              required={required}
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setFileName(file?.name);
                setPreview(file ? URL.createObjectURL(file) : null);
                if (file) void replaceWithDrawing(event.target, file);
              }}
            />
          </div>
        )}
      </FormField>
      {fileName !== undefined && (
        <Button
          type="button"
          variant="ghost"
          className="justify-self-start"
          onClick={() => {
            input.current!.value = '';
            setFileName(undefined);
            setPreview(null);
            input.current!.focus();
          }}
        >
          <XIcon aria-hidden />
          {t('fields.logoClear')}
        </Button>
      )}
    </div>
  );
}
