import { CircleUserIcon, LogOutIcon, UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSubmit } from 'react-router';
import { ThemeItems } from '~/components/ThemeItems';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

/** `detail` is a second line, e.g. the role. */
export function AccountMenu({ email, detail }: { email: string; detail?: string }) {
  const { t } = useTranslation();
  const submit = useSubmit();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('nav.account')}
          className="text-inherit hover:bg-ink-accent hover:text-ink-foreground dark:hover:bg-ink-accent"
        >
          <CircleUserIcon aria-hidden className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate">{email}</span>
          {detail && <span className="block truncate text-muted-foreground">{detail}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ThemeItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <UserIcon aria-hidden />
            {t('nav.profile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => submit(null, { method: 'post', action: '/logout' })}>
          <LogOutIcon aria-hidden />
          {t('nav.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
