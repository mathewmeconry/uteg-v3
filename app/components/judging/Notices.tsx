import { BellIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import type { Notice } from './judgeState';

/** What changed while judging. Stays until dismissed. */
export function Notices({
  notices,
  onDismiss,
}: {
  notices: readonly Notice[];
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation('judging');

  function text(notice: Notice) {
    if (notice.kind === 'addedLate') {
      return t('notices.addedLate', { name: notice.name, round: notice.round + 1 });
    }
    if ('name' in notice) return t(`notices.${notice.kind}`, { name: notice.name });
    const { category, sex, number } = notice.division;
    const division = t('division', { category, number, sex: t(`sexShort.${sex}`) });
    return t(`notices.${notice.kind}`, { division });
  }

  return (
    <div role="status" aria-label={t('notices.label')} className="grid gap-2 empty:hidden">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className="flex items-center gap-3 rounded-lg bg-warning px-4 py-2 text-warning-foreground"
        >
          <BellIcon aria-hidden className="size-5 shrink-0" />
          <p className="min-w-0 flex-1 font-medium wrap-anywhere">{text(notice)}</p>
          <Button
            variant="ghost"
            size="icon"
            className="text-warning-foreground hover:bg-transparent"
            aria-label={t('notices.dismiss', { text: text(notice) })}
            onClick={() => onDismiss(notice.id)}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
      ))}
    </div>
  );
}
