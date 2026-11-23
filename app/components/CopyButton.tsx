import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';

/** Copies `value`, e.g. a judge link. */
export function CopyButton({
  value,
  label,
  ...props
}: { value: string; label?: string } & Omit<ComponentProps<typeof Button>, 'value'>) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access, e.g. without https.
      toast.error(t('errors.generic'));
    }
  }

  const Icon = copied ? CheckIcon : CopyIcon;
  return (
    <Button type="button" variant="outline" onClick={copy} {...props}>
      <Icon aria-hidden />
      {copied ? t('actions.copied') : (label ?? t('actions.copy'))}
    </Button>
  );
}
