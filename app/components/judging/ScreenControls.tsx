import { LanguagesIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { FONT_SCALES } from '~/hooks/useFontScale';
import { LANGUAGES, type Language } from '~/locales';

/** Font size and language of a tablet or display, for its ink header. */
export function ScreenControls({
  scale,
  onScale,
}: {
  scale: number;
  onScale: (step: 1 | -1) => void;
}) {
  const { t, i18n } = useTranslation('judging');

  function switchLanguage() {
    const language: Language = LANGUAGES[i18n.language === LANGUAGES[0] ? 1 : 0];
    void i18n.changeLanguage(language);
    // Only for the next load, so it may fail.
    fetch('/api/language', {
      method: 'POST',
      body: new URLSearchParams({ language }),
      referrerPolicy: 'same-origin',
    }).catch(() => {});
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Button
        variant="onInk"
        aria-label={t('screen.smaller')}
        disabled={scale <= FONT_SCALES[0]}
        onClick={() => onScale(-1)}
      >
        A−
      </Button>
      <Button
        variant="onInk"
        aria-label={t('screen.larger')}
        disabled={scale >= FONT_SCALES.at(-1)!}
        onClick={() => onScale(1)}
      >
        A+
      </Button>
      <Button variant="onInk" aria-label={t('screen.switchLanguage')} onClick={switchLanguage}>
        <LanguagesIcon aria-hidden />
        {i18n.language === 'de' ? 'DE' : 'EN'}
      </Button>
    </div>
  );
}
