import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '~/components/FormField';

/** File input of the logo with a preview of the chosen file. */
export function LogoField({ error, required }: { error?: string; required?: boolean }) {
  const { t } = useTranslation('competition');
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
          setPreview(file ? URL.createObjectURL(file) : null);
        }}
      />
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
