import { AArrowDownIcon, AArrowUpIcon, LanguagesIcon, SlidersHorizontalIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ThemeItems } from '~/components/ThemeItems';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { FONT_SCALES } from '~/hooks/useFontScale';
import { LANGUAGES, type Language } from '~/locales';

/** Font size, language and theme of a tablet or display, for its ink header. */
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="onInk" size="icon" aria-label={t('screen.menu')}>
          <SlidersHorizontalIcon aria-hidden className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem
          disabled={scale <= FONT_SCALES[0]}
          onSelect={(event) => {
            event.preventDefault();
            onScale(-1);
          }}
        >
          <AArrowDownIcon aria-hidden />
          {t('screen.smaller')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={scale >= FONT_SCALES.at(-1)!}
          onSelect={(event) => {
            event.preventDefault();
            onScale(1);
          }}
        >
          <AArrowUpIcon aria-hidden />
          {t('screen.larger')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={switchLanguage}>
          <LanguagesIcon aria-hidden />
          {t('screen.switchLanguage')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
