import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '~/components/ui/dropdown-menu';
import { setTheme, THEMES, type Theme } from '~/lib/theme';

/** The choice of light and dark, for a menu. */
export function ThemeItems() {
  const { t } = useTranslation();
  const [theme, setChosen] = useState(() => document.documentElement.dataset.theme);

  function choose(value: string) {
    setTheme(value as Theme);
    setChosen(value);
  }

  return (
    <>
      <DropdownMenuLabel id="theme">{t('theme.label')}</DropdownMenuLabel>
      <DropdownMenuRadioGroup aria-labelledby="theme" value={theme} onValueChange={choose}>
        {THEMES.map((value) => (
          <DropdownMenuRadioItem
            key={value}
            value={value}
            // Stays open, so the result can be compared.
            onSelect={(event) => event.preventDefault()}
          >
            {t(`theme.${value}`)}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
