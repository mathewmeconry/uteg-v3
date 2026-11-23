import { ChevronsUpDownIcon, CircleUserIcon, LogOutIcon, UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSubmit } from 'react-router';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { SidebarMenuButton } from '~/components/ui/sidebar';

/** An icon, or a whole row of the sidebar with the address and a second line. */
export function AccountMenu({ email, detail }: { email: string; detail?: string }) {
  const { t } = useTranslation();
  const submit = useSubmit();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {detail ? (
          <SidebarMenuButton size="lg" aria-label={`${t('nav.account')}: ${email}`}>
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-accent text-sm font-bold text-sidebar-accent-foreground uppercase"
            >
              {email[0]}
            </span>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-semibold">{email}</span>
              <span className="truncate text-xs text-muted-foreground">{detail}</span>
            </span>
            <ChevronsUpDownIcon aria-hidden className="ml-auto text-muted-foreground" />
          </SidebarMenuButton>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('nav.account')}
            className="text-inherit hover:bg-ink-accent hover:text-ink-foreground dark:hover:bg-ink-accent"
          >
            <CircleUserIcon aria-hidden className="size-5" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
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
