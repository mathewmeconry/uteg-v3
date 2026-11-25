import { SearchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Toolbar } from '~/components/Toolbar';
import { Input } from '~/components/ui/input';

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const { t } = useTranslation();
  return (
    <Toolbar>
      <div className="relative max-w-md flex-1">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={t('actions.search')}
          className="pl-9"
        />
      </div>
    </Toolbar>
  );
}
