import { PencilIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { useActionFetcher } from '~/hooks/useActionFetcher';
import type { ContestOptions } from '~/lib/contestOptions.server';
import { cn } from '~/lib/utils';
import type { EgtApparatus } from '~/modules/egt/module';
import { fittingDivisions } from './EntryFields';
import { fullName, type StarterRow } from './starterRow';

/** Assigns one person after the other while the list stays visible. Saves with every choice. */
export function StarterPanel({
  starter,
  options,
  onEdit,
  onClose,
}: {
  starter: StarterRow;
  options: ContestOptions;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const { submit, pending } = useActionFetcher();
  const { category, sex, entryId } = starter;
  const divisions = category ? fittingDivisions(options, { category, sex }) : [];
  const division = divisions.find(({ id }) => id === starter.divisionId);
  const name = fullName(starter);
  // One click must not take anyone off a tablet or out of a ranking.
  const isLocked = division !== undefined && division.state !== 'PENDING';

  function assign(divisionId: string, startApparatus?: string) {
    const assignments = [{ entryIds: [entryId], divisionId, startApparatus }];
    void submit(
      { intent: 'assign', assignments: JSON.stringify(assignments), quiet: '1' },
      { method: 'post' },
    );
  }

  return (
    <aside
      aria-label={name}
      className="sticky top-22 hidden w-68 shrink-0 gap-5 self-start rounded-xl border bg-card p-4 xl:grid"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-xl leading-tight wrap-anywhere">{name}</h2>
          <p className="text-sm text-muted-foreground">
            {starter.club.name}, {starter.birthYear}
          </p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('common:actions.close')}
          onClick={onClose}
        >
          <XIcon aria-hidden />
        </Button>
      </div>

      {!category || !entryId ? (
        <p className="text-sm text-muted-foreground">{t('panel.noCategory')}</p>
      ) : (
        <>
          {isLocked && <p className="text-sm text-muted-foreground">{t('panel.locked')}</p>}
          <Choices legend={`${t('division')} ${category} ${t(`common:sex.${sex}`)}`}>
            {divisions.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('assign.noDivisions')}</p>
            )}
            {divisions.map(({ id, number, state, starterCount }) => (
              <Choice
                key={id}
                isChosen={id === division?.id}
                disabled={pending || isLocked || state !== 'PENDING'}
                onChoose={() => assign(id)}
              >
                {t('divisionNumber', { number })}
                <span className="font-normal opacity-80">
                  {state === 'PENDING'
                    ? t('common:starterCount', { count: starterCount })
                    : t(`common:divisionState.${state}`)}
                </span>
              </Choice>
            ))}
          </Choices>
          {division && (
            <Choices legend={t('common:fields.startApparatus')}>
              {division.apparatus.map((apparatus) => (
                <Choice
                  key={apparatus}
                  isChosen={apparatus === starter.startApparatus}
                  disabled={pending || isLocked}
                  onChoose={() => assign(division.id, apparatus)}
                >
                  {t(`common:apparatus.${apparatus as EgtApparatus}`)}
                </Choice>
              ))}
            </Choices>
          )}
        </>
      )}
      <Button variant="outline" className="justify-self-start" onClick={onEdit}>
        <PencilIcon aria-hidden />
        {t('common:actions.edit')}
      </Button>
    </aside>
  );
}

function Choices({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}

/** No radio: going through them with the arrow keys would already assign. */
function Choice({
  isChosen,
  disabled,
  onChoose,
  children,
}: {
  isChosen: boolean;
  disabled: boolean;
  onChoose: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={isChosen}
      // Keeps the focus, unlike `disabled`.
      aria-disabled={disabled}
      onClick={() => !disabled && !isChosen && onChoose()}
      className={cn(
        'flex min-h-10 items-center justify-between gap-3 rounded-md border border-input px-3 text-left text-sm font-semibold pointer-coarse:min-h-11',
        disabled ? 'cursor-default' : 'hover:bg-accent',
        disabled && !isChosen && 'text-muted-foreground',
        isChosen &&
          'border-ink bg-ink text-ink-foreground hover:bg-ink dark:border-primary dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary',
      )}
    >
      {children}
    </button>
  );
}
