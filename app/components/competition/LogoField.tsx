import { XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '~/components/FormField';
import { Button } from '~/components/ui/button';

/** File input of the logo with a preview of the chosen file. */
export function LogoField({ error, required }: { error?: string; required?: boolean }) {
  const { t } = useTranslation('competition');
  const input = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);
  // Null also when the file cannot be shown.
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="grid gap-3">
      <FormField
        label={t('fields.logo')}
        hint={t('fields.logoHint')}
        error={error}
        name="logo"
        type="file"
        accept="image/png,image/jpeg"
        required={required}
        onChange={(event) => {
          const file = event.target.files?.[0];
          setHasFile(Boolean(file));
          setPreview(file ? URL.createObjectURL(file) : null);
        }}
        ref={input}
      />
      {hasFile && (
        <Button
          type="button"
          variant="ghost"
          className="justify-self-start"
          onClick={() => {
            input.current!.value = '';
            setHasFile(false);
            setPreview(null);
            input.current!.focus();
          }}
        >
          <XIcon aria-hidden />
          {t('fields.logoClear')}
        </Button>
      )}
      {preview && (
        <img
          src={preview}
          alt=""
          className="h-20 max-w-full object-contain object-left"
          onError={() => setPreview(null)}
        />
      )}
    </div>
  );
}
