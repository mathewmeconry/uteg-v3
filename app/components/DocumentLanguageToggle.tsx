import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { useDocumentLanguage } from '~/hooks/useDocumentLanguage';
import { isLanguage, LANGUAGES } from '~/locales';

/** The language of exported documents, next to what exports them. */
export function DocumentLanguageToggle() {
  const { t } = useTranslation();
  const [language, choose] = useDocumentLanguage();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label={t('documentLanguage')}
      title={t('documentLanguage')}
      value={language}
      // Empty when the chosen one is clicked again.
      onValueChange={(value) => isLanguage(value) && choose(value)}
    >
      {LANGUAGES.map((value) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={t(`language.${value}`)}
          className="uppercase data-[state=on]:bg-ink data-[state=on]:text-ink-foreground dark:data-[state=on]:bg-primary dark:data-[state=on]:text-primary-foreground"
        >
          {value}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
